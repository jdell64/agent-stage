/**
 * Main-process Hive Analytics collector.
 *
 * Gathers on-disk hive artifacts (`registry.json`, `tasks.json`, `log.jsonl`,
 * `cost-ledger.jsonl`) and live OpenTelemetry samples/spans, then delegates to
 * `buildHiveAnalyticsReport` in `src/shared/agentAnalytics.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { filesInOrder } from './appendLog';
import type { HiveManager } from './hive';
import type { TelemetryCollector } from './telemetry';
import {
  buildHiveAnalyticsReport,
  type AnalyticsAgentMeta,
  type AnalyticsCostRow,
  type AnalyticsLogEvent,
  type AnalyticsTaskInput,
  type AnalyticsToolSpan,
  type HiveAnalyticsReport
} from '../shared/agentAnalytics';
import { inferAgentProvider } from '../shared/agentProvider';

function readCostLedgerRows(hiveRoot: string | null): AnalyticsCostRow[] {
  if (!hiveRoot) return [];
  const basePath = join(hiveRoot, 'cost-ledger.jsonl');
  const files = filesInOrder(basePath);
  const rows: AnalyticsCostRow[] = [];

  for (const file of files) {
    if (!existsSync(file)) continue;
    let raw = '';
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }
      const agentId = typeof parsed.agent_id === 'string'
        ? parsed.agent_id
        : typeof parsed.agentId === 'string'
          ? parsed.agentId
          : '';
      if (!agentId) continue;
      const sessionId = typeof parsed.session_id === 'string'
        ? parsed.session_id
        : typeof parsed.sessionId === 'string'
          ? parsed.sessionId
          : '_default';
      rows.push({
        agentId,
        sessionId,
        ts: typeof parsed.ts === 'number' ? parsed.ts : undefined,
        input: typeof parsed.input === 'number' && Number.isFinite(parsed.input) ? parsed.input : 0,
        output: typeof parsed.output === 'number' && Number.isFinite(parsed.output) ? parsed.output : 0,
        cacheRead: typeof parsed.cache_read === 'number' && Number.isFinite(parsed.cache_read)
          ? parsed.cache_read
          : typeof parsed.cacheRead === 'number' && Number.isFinite(parsed.cacheRead)
            ? parsed.cacheRead
            : 0,
        cacheCreation: typeof parsed.cache_creation === 'number' && Number.isFinite(parsed.cache_creation)
          ? parsed.cache_creation
          : typeof parsed.cacheCreation === 'number' && Number.isFinite(parsed.cacheCreation)
            ? parsed.cacheCreation
            : 0,
        model: typeof parsed.model === 'string' ? parsed.model : undefined,
        usd: typeof parsed.usd === 'number' && Number.isFinite(parsed.usd) ? parsed.usd : 0
      });
    }
  }
  return rows;
}

export function computeHiveAnalytics(
  hive: HiveManager,
  telemetry: TelemetryCollector
): HiveAnalyticsReport {
  const reg = hive.registry();
  const agents: Record<string, AnalyticsAgentMeta> = {};

  for (const [id, a] of Object.entries(reg.agents ?? {})) {
    const provider = inferAgentProvider(a.command, a.provider);
    agents[id] = {
      id: a.id || id,
      name: a.name || id,
      role: a.role,
      provider,
      model: a.model || 'default',
      command: a.command,
      cwd: a.cwd,
      status: a.status,
      archived: !!a.archived,
      isOrchestrator: !!a.isOrchestrator || reg.orchestratorId === id,
      isAssistant: !!a.isAssistant
    };
  }

  const rawTasksObj = hive.tasks() as { tasks?: unknown[] } | null;
  const rawTasks = Array.isArray(rawTasksObj?.tasks) ? rawTasksObj.tasks : [];
  const tasks: AnalyticsTaskInput[] = [];
  for (const t of rawTasks) {
    if (!t || typeof t !== 'object') continue;
    const rec = t as Record<string, unknown>;
    if (typeof rec.id !== 'string' || typeof rec.title !== 'string') continue;
    const status = rec.status === 'doing' || rec.status === 'blocked' || rec.status === 'done'
      ? rec.status
      : 'todo';
    tasks.push({
      id: rec.id,
      title: rec.title,
      description: typeof rec.description === 'string' ? rec.description : undefined,
      assignee: typeof rec.assignee === 'string' ? rec.assignee : undefined,
      status,
      createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : undefined,
      startedAt: typeof rec.startedAt === 'string' ? rec.startedAt : undefined,
      completedAt: typeof rec.completedAt === 'string' ? rec.completedAt : undefined,
      category: typeof rec.category === 'string' ? (rec.category as AnalyticsTaskInput['category']) : undefined,
      humanQA: Array.isArray(rec.humanQA) ? (rec.humanQA as Array<{ q: string; a?: string }>) : undefined
    });
  }

  const logEvents = (hive.logTail(2000) ?? []) as AnalyticsLogEvent[];
  const costRows = readCostLedgerRows(hive.root());

  const snap = telemetry.snapshot();
  const liveUsage: Record<string, AnalyticsCostRow | null | undefined> = {};
  for (const [agentId, sample] of Object.entries(snap.usage ?? {})) {
    if (!sample) continue;
    liveUsage[agentId] = {
      agentId: sample.agentId || agentId,
      sessionId: sample.sessionId || '_live',
      ts: sample.ts,
      input: sample.input,
      output: sample.output,
      cacheRead: sample.cacheRead,
      cacheCreation: sample.cacheCreation,
      model: sample.model,
      usd: sample.usd
    };
  }

  const toolSpans: Record<string, AnalyticsToolSpan[]> = {};
  for (const [agentId, spans] of Object.entries(snap.spans ?? {})) {
    if (!Array.isArray(spans)) continue;
    toolSpans[agentId] = spans.map((s) => ({
      agentId: s.agentId || agentId,
      sessionId: s.sessionId,
      ts: s.ts,
      tool: s.tool,
      success: s.success,
      durationMs: s.durationMs,
      error: s.error
    }));
  }

  return buildHiveAnalyticsReport({
    agents,
    orchestratorId: reg.orchestratorId,
    tasks,
    logEvents,
    costRows,
    liveUsage,
    toolSpans
  });
}

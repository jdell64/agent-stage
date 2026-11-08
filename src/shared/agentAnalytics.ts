/**
 * Objective Agent & Model Statistics / Strengths Engine.
 *
 * Folds five orthogonal signals from the hive and live telemetry to answer
 * "Which agents and models are objectively better at what?":
 *   1. Task & message completion (`tasks.json` + `act: 'done'` messages in `log.jsonl`)
 *   2. First-pass autonomy (completions without `humanQA` blocks, `refuse` acts, or breaker trips)
 *   3. Cost & token efficiency (`cost-ledger.jsonl` + live usage per completed unit, plus cache hit ratio)
 *   4. Turnaround cycle time (`startedAt -> completedAt` or `request -> done` message pairs)
 *   5. Tool reliability & process stability (tool span success rate, abnormal exits, breaker trips)
 *
 * Pure and deterministic so it can run in `src/main`, be imported by the
 * renderer for instant smart-dispatch recommendations, and be unit-tested
 * without Electron or filesystem mocks.
 */

export type TaskCategory =
  | 'frontend'
  | 'backend'
  | 'testing'
  | 'debugging'
  | 'devops'
  | 'docs'
  | 'general';

export const TASK_CATEGORIES: readonly TaskCategory[] = [
  'frontend',
  'backend',
  'testing',
  'debugging',
  'devops',
  'docs',
  'general'
] as const;

export interface AnalyticsTaskInput {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  status: 'todo' | 'doing' | 'blocked' | 'done';
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  category?: TaskCategory;
  humanQA?: Array<{ q: string; a?: string }>;
}

export interface AnalyticsAgentMeta {
  id: string;
  name: string;
  role?: string;
  provider?: string;
  model?: string;
  command?: string;
  cwd?: string;
  status?: string;
  archived?: boolean;
  isOrchestrator?: boolean;
  isAssistant?: boolean;
}

export interface AnalyticsLogEvent {
  ts?: number;
  kind?: string;
  agentId?: string;
  from?: string;
  to?: string;
  act?: string;
  subject?: string;
  level?: string;
  abnormal?: boolean;
  exitCode?: number | null;
  provider?: string;
  model?: string;
}

export interface AnalyticsCostRow {
  agentId: string;
  sessionId: string;
  ts?: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  model?: string;
  usd: number;
}

export interface AnalyticsToolSpan {
  agentId: string;
  sessionId?: string;
  ts?: number;
  tool: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

export interface AnalyticsInput {
  agents: Record<string, AnalyticsAgentMeta>;
  orchestratorId?: string | null;
  tasks: AnalyticsTaskInput[];
  logEvents: AnalyticsLogEvent[];
  costRows: AnalyticsCostRow[];
  liveUsage?: Record<string, AnalyticsCostRow | null | undefined>;
  toolSpans?: Record<string, AnalyticsToolSpan[] | undefined>;
  now?: number;
}

export interface CategoryPerformance {
  category: TaskCategory;
  tasksAssigned: number;
  tasksDone: number;
  tasksBlocked: number;
  messagesDone: number;
  completedUnits: number;
  completionRate: number;
  score: number;
  roleMatch: boolean;
}

export interface AgentScorecard {
  agentId: string;
  name: string;
  role?: string;
  provider: string;
  model: string;
  archived: boolean;
  isOrchestrator: boolean;
  /** Overall objective score (0..100). */
  compositeScore: number;
  /** Sub-scores (0..100 each). */
  completionScore: number;
  autonomyScore: number;
  efficiencyScore: number;
  reliabilityScore: number;
  speedScore: number;
  /** Confidence level based on observed work volume ('low' | 'medium' | 'high'). */
  confidence: 'low' | 'medium' | 'high';
  /** Raw task & message counts. */
  tasksAssigned: number;
  tasksDone: number;
  tasksDoing: number;
  tasksBlocked: number;
  messagesDone: number;
  messagesRefused: number;
  humanEscalations: number;
  completedUnits: number;
  /** First-pass autonomy ratio (0..1). */
  autonomyRate: number;
  /** Cycle time in milliseconds (null when no timed completions exist). */
  avgDurationMs: number | null;
  /** Lifetime token & USD metrics. */
  lifetimeUsd: number;
  workTokens: number;
  totalTokens: number;
  cacheHitRate: number;
  usdPerUnit: number | null;
  workTokensPerUnit: number | null;
  /** Tool execution & stability metrics. */
  toolCalls: number;
  toolSuccessRate: number | null;
  avgToolLatencyMs: number | null;
  abnormalExits: number;
  breakerTrips: number;
  /** Per-category breakdown and top strengths. */
  categories: Record<TaskCategory, CategoryPerformance>;
  topCategories: TaskCategory[];
}

export interface ModelScorecard {
  key: string;
  provider: string;
  model: string;
  agentCount: number;
  completedUnits: number;
  tasksDone: number;
  tasksAssigned: number;
  compositeScore: number;
  autonomyRate: number;
  lifetimeUsd: number;
  workTokens: number;
  cacheHitRate: number;
  usdPerUnit: number | null;
  workTokensPerUnit: number | null;
  toolCalls: number;
  toolSuccessRate: number | null;
  abnormalExits: number;
  breakerTrips: number;
}

export interface CategoryLeader {
  category: TaskCategory;
  leaderAgentId: string | null;
  leaderName: string | null;
  leaderProvider: string | null;
  leaderModel: string | null;
  leaderScore: number;
  completedUnits: number;
  tasksDone: number;
  tasksAssigned: number;
  usdPerUnit: number | null;
  autonomyRate: number;
  runnerUpAgentId: string | null;
  runnerUpName: string | null;
  runnerUpScore: number | null;
  rationale: string;
}

export interface TaskRecommendation {
  category: TaskCategory;
  agentId: string;
  agentName: string;
  provider: string;
  model: string;
  score: number;
  confidence: 'low' | 'medium' | 'high';
  rationale: string;
}

export interface HiveAnalyticsReport {
  generatedAt: number;
  fleetSummary: {
    totalAgents: number;
    activeWorkers: number;
    totalTasksAssigned: number;
    totalTasksDone: number;
    totalCompletedUnits: number;
    fleetAutonomyRate: number;
    fleetLifetimeUsd: number;
    fleetTotalTokens: number;
    fleetCacheHitRate: number;
    topAgentId: string | null;
    topAgentName: string | null;
    topModelKey: string | null;
  };
  agents: AgentScorecard[];
  models: ModelScorecard[];
  categoryLeaders: Record<TaskCategory, CategoryLeader>;
}

// ─── Domain / Category Classifier ───────────────────────────────────────────

const CATEGORY_PATTERNS: Record<Exclude<TaskCategory, 'general'>, RegExp[]> = {
  frontend: [
    /\b(ui|ux|react|component|tsx|jsx|css|scss|style|layout|modal|dialog|tab|button|badge|banner|icon|xterm|terminal view|canvas|sprite|pixel|theme|dark mode|light mode|i18n|locale|translation|renderer|sidebar|toolbar|header|dropdown|select|input|form|tooltip|panel|card|avatar|visual|display)\b/i
  ],
  backend: [
    /\b(main process|ipc|ipcmain|ipcrenderer|preload|sqlite|database|db|sql|webhook|slack|socket|pty|node-pty|router|hive|server|endpoint|api|auth|secret|token|broker|config|filesystem|fs|spawn|process|sidecar|bridge|hook|telemetry|ledger|persistence|store)\b/i
  ],
  testing: [
    /\b(test|tests|testing|spec|vitest|playwright|e2e|unit test|integration test|assertion|coverage|mock|fixture|regression|qa|verify|validation)\b/i
  ],
  debugging: [
    /\b(bug|fix|crash|error|race|hang|freeze|wedge|wedged|leak|conflict|broken|exception|recover|recovery|stale|corrupt|garbled|deadlock|looping|diagnose|troubleshoot|investigate|hotfix)\b/i
  ],
  devops: [
    /\b(build|ci|cd|github action|workflow|release|package|packaging|electron-builder|worktree|sync|upstream|git|deploy|script|npm|bundle|vite|tsconfig|typecheck|lint|docker|install|installer|update|updater)\b/i
  ],
  docs: [
    /\b(doc|docs|documentation|readme|plan|guide|comment|changelog|architecture|protocol|memory|onboarding copy|blurb|markdown|diagram)\b/i
  ]
};

/**
 * Deterministically classify a task title/description (or message subject) into
 * a `TaskCategory`. Counts keyword matches across each domain and picks the
 * highest-scoring category, breaking ties in a deterministic priority order.
 */
export function classifyTaskCategory(text: string, fallbackText = ''): TaskCategory {
  const combined = `${text || ''} ${fallbackText || ''}`.trim();
  if (!combined) return 'general';

  const order: Array<Exclude<TaskCategory, 'general'>> = [
    'testing',
    'debugging',
    'frontend',
    'backend',
    'devops',
    'docs'
  ];

  let bestCat: TaskCategory = 'general';
  let bestScore = 0;

  for (const cat of order) {
    const patterns = CATEGORY_PATTERNS[cat];
    let score = 0;
    for (const regex of patterns) {
      const globalRegex = new RegExp(regex.source, 'gi');
      const matches = combined.match(globalRegex);
      if (matches) score += matches.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }

  return bestCat;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function median(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2 : valid[mid];
}

function parseIsoMs(iso?: string): number | null {
  if (!iso || typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

interface FoldedSessionUsage {
  agentId: string;
  sessionId: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  usd: number;
}

/**
 * Fold cumulative per-session cost-ledger rows + live telemetry samples with
 * reset detection (matching `costLifetime.ts`), preserving token counts and
 * model attribution per session.
 */
function foldUsageSessions(
  costRows: AnalyticsCostRow[],
  liveUsage: Record<string, AnalyticsCostRow | null | undefined> = {},
  agentModels: Record<string, string> = {}
): FoldedSessionUsage[] {
  interface Accum {
    agentId: string;
    sessionId: string;
    model: string;
    carriedInput: number;
    carriedOutput: number;
    carriedCacheRead: number;
    carriedCacheCreation: number;
    carriedUsd: number;
    highInput: number;
    highOutput: number;
    highCacheRead: number;
    highCacheCreation: number;
    highUsd: number;
  }

  const byKey = new Map<string, Accum>();

  const ingest = (row: AnalyticsCostRow) => {
    if (!row || typeof row.agentId !== 'string' || !row.agentId) return;
    const sessionId = typeof row.sessionId === 'string' && row.sessionId ? row.sessionId : '_default';
    const key = `${row.agentId}\u0000${sessionId}`;
    const input = Math.max(0, Number(row.input) || 0);
    const output = Math.max(0, Number(row.output) || 0);
    const cacheRead = Math.max(0, Number(row.cacheRead) || 0);
    const cacheCreation = Math.max(0, Number(row.cacheCreation) || 0);
    const usd = Math.max(0, Number(row.usd) || 0);
    const model = (typeof row.model === 'string' && row.model.trim()) || agentModels[row.agentId] || 'default';

    let acc = byKey.get(key);
    if (!acc) {
      acc = {
        agentId: row.agentId,
        sessionId,
        model,
        carriedInput: 0,
        carriedOutput: 0,
        carriedCacheRead: 0,
        carriedCacheCreation: 0,
        carriedUsd: 0,
        highInput: input,
        highOutput: output,
        highCacheRead: cacheRead,
        highCacheCreation: cacheCreation,
        highUsd: usd
      };
      byKey.set(key, acc);
      return;
    }

    if (row.model && row.model.trim()) acc.model = row.model.trim();

    // Detect cumulative counter reset (e.g. session restart with same session_id)
    if (usd + 1e-9 < acc.highUsd || input + output < (acc.highInput + acc.highOutput) * 0.5) {
      acc.carriedInput += acc.highInput;
      acc.carriedOutput += acc.highOutput;
      acc.carriedCacheRead += acc.highCacheRead;
      acc.carriedCacheCreation += acc.highCacheCreation;
      acc.carriedUsd += acc.highUsd;
      acc.highInput = input;
      acc.highOutput = output;
      acc.highCacheRead = cacheRead;
      acc.highCacheCreation = cacheCreation;
      acc.highUsd = usd;
    } else {
      if (input > acc.highInput) acc.highInput = input;
      if (output > acc.highOutput) acc.highOutput = output;
      if (cacheRead > acc.highCacheRead) acc.highCacheRead = cacheRead;
      if (cacheCreation > acc.highCacheCreation) acc.highCacheCreation = cacheCreation;
      if (usd > acc.highUsd) acc.highUsd = usd;
    }
  };

  for (const r of costRows) ingest(r);
  for (const [agentId, sample] of Object.entries(liveUsage)) {
    if (sample) ingest({ ...sample, agentId: sample.agentId || agentId });
  }

  const out: FoldedSessionUsage[] = [];
  for (const acc of byKey.values()) {
    out.push({
      agentId: acc.agentId,
      sessionId: acc.sessionId,
      model: acc.model,
      input: acc.carriedInput + acc.highInput,
      output: acc.carriedOutput + acc.highOutput,
      cacheRead: acc.carriedCacheRead + acc.highCacheRead,
      cacheCreation: acc.carriedCacheCreation + acc.highCacheCreation,
      usd: acc.carriedUsd + acc.highUsd
    });
  }
  return out;
}

function emptyCategoryPerf(category: TaskCategory, roleMatch: boolean): CategoryPerformance {
  return {
    category,
    tasksAssigned: 0,
    tasksDone: 0,
    tasksBlocked: 0,
    messagesDone: 0,
    completedUnits: 0,
    completionRate: 0,
    score: 0,
    roleMatch
  };
}

/**
 * Build the complete Hive Analytics Report from tasks, log events, cost ledger,
 * and live telemetry spans.
 */
export function buildHiveAnalyticsReport(input: AnalyticsInput): HiveAnalyticsReport {
  const now = input.now ?? Date.now();
  const agentsMap: Record<string, AnalyticsAgentMeta> = { ...input.agents };

  // Ensure any agent referenced in tasks, logs, or cost rows exists in agentsMap
  const ensureAgent = (id: string | undefined, patch?: Partial<AnalyticsAgentMeta>) => {
    if (!id || id === 'system' || id === 'human' || id === 'broadcast' || id === 'orchestrator') return;
    if (!agentsMap[id]) {
      agentsMap[id] = {
        id,
        name: id.replace(/-[a-z0-9]{6,}$/i, ''),
        provider: patch?.provider ?? 'claude',
        model: patch?.model ?? 'default',
        archived: true,
        ...patch
      };
    } else if (patch) {
      if (patch.provider && !agentsMap[id].provider) agentsMap[id].provider = patch.provider;
      if (patch.model && !agentsMap[id].model) agentsMap[id].model = patch.model;
    }
  };

  for (const t of input.tasks) {
    if (t?.assignee) ensureAgent(t.assignee);
  }
  for (const ev of input.logEvents) {
    if (ev?.kind === 'spawn' && ev.agentId) {
      ensureAgent(ev.agentId, { provider: ev.provider, model: ev.model });
    }
    if (ev?.from) ensureAgent(ev.from);
  }
  for (const c of input.costRows) {
    if (c?.agentId) ensureAgent(c.agentId, { model: c.model });
  }

  const agentIds = Object.keys(agentsMap);
  const agentModels: Record<string, string> = {};
  for (const id of agentIds) {
    agentModels[id] = agentsMap[id].model || 'default';
  }

  // Fold usage sessions
  const foldedSessions = foldUsageSessions(input.costRows, input.liveUsage, agentModels);

  // Per-agent accumulators
  interface AgentAccum {
    meta: AnalyticsAgentMeta;
    tasksAssigned: number;
    tasksDone: number;
    tasksDoing: number;
    tasksBlocked: number;
    tasksWithHumanQA: number;
    messagesDone: number;
    messagesRefused: number;
    abnormalExits: number;
    breakerTrips: number;
    durationsMs: number[];
    lastRequestTs: number | null;
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
    usd: number;
    toolCalls: number;
    toolSuccesses: number;
    toolDurationMsSum: number;
    categories: Record<TaskCategory, CategoryPerformance>;
  }

  const accumById = new Map<string, AgentAccum>();
  for (const id of agentIds) {
    const meta = agentsMap[id];
    const roleCat = meta.role ? classifyTaskCategory(meta.role) : 'general';
    const categories = {} as Record<TaskCategory, CategoryPerformance>;
    for (const cat of TASK_CATEGORIES) {
      categories[cat] = emptyCategoryPerf(cat, roleCat !== 'general' && roleCat === cat);
    }
    accumById.set(id, {
      meta,
      tasksAssigned: 0,
      tasksDone: 0,
      tasksDoing: 0,
      tasksBlocked: 0,
      tasksWithHumanQA: 0,
      messagesDone: 0,
      messagesRefused: 0,
      abnormalExits: 0,
      breakerTrips: 0,
      durationsMs: [],
      lastRequestTs: null,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
      usd: 0,
      toolCalls: 0,
      toolSuccesses: 0,
      toolDurationMsSum: 0,
      categories
    });
  }

  // 1. Fold tasks
  for (const task of input.tasks) {
    if (!task || !task.assignee) continue;
    const acc = accumById.get(task.assignee);
    if (!acc) continue;
    const cat = task.category && TASK_CATEGORIES.includes(task.category)
      ? task.category
      : classifyTaskCategory(task.title, task.description);

    acc.tasksAssigned++;
    acc.categories[cat].tasksAssigned++;

    if (Array.isArray(task.humanQA) && task.humanQA.length > 0) {
      acc.tasksWithHumanQA++;
    }

    if (task.status === 'done') {
      acc.tasksDone++;
      acc.categories[cat].tasksDone++;
      const startMs = parseIsoMs(task.startedAt) ?? parseIsoMs(task.createdAt);
      const endMs = parseIsoMs(task.completedAt);
      if (startMs && endMs && endMs > startMs && endMs - startMs < 24 * 3600 * 1000) {
        acc.durationsMs.push(endMs - startMs);
      }
    } else if (task.status === 'doing') {
      acc.tasksDoing++;
    } else if (task.status === 'blocked') {
      acc.tasksBlocked++;
      acc.categories[cat].tasksBlocked++;
    }
  }

  // 2. Fold log.jsonl events (sorted chronologically by ts if present)
  const sortedEvents = [...input.logEvents].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  for (const ev of sortedEvents) {
    if (!ev || typeof ev.kind !== 'string') continue;
    if (ev.kind === 'message') {
      // Track when an agent receives a request so we can measure request -> done turnaround
      if (ev.act === 'request' && typeof ev.to === 'string' && accumById.has(ev.to)) {
        const targetAcc = accumById.get(ev.to)!;
        if (typeof ev.ts === 'number' && ev.ts > 0) {
          targetAcc.lastRequestTs = ev.ts;
        }
      }
      if (typeof ev.from === 'string' && accumById.has(ev.from)) {
        const senderAcc = accumById.get(ev.from)!;
        if (ev.act === 'done') {
          senderAcc.messagesDone++;
          const msgCat = classifyTaskCategory(ev.subject ?? '');
          senderAcc.categories[msgCat].messagesDone++;
          if (typeof ev.ts === 'number' && senderAcc.lastRequestTs && ev.ts > senderAcc.lastRequestTs) {
            const delta = ev.ts - senderAcc.lastRequestTs;
            if (delta > 1_000 && delta < 12 * 3600 * 1000) {
              senderAcc.durationsMs.push(delta);
            }
            senderAcc.lastRequestTs = null;
          }
        } else if (ev.act === 'refuse') {
          senderAcc.messagesRefused++;
        }
      }
    } else if (ev.kind === 'agent-exit' && typeof ev.agentId === 'string' && accumById.has(ev.agentId)) {
      if (ev.abnormal !== false) {
        accumById.get(ev.agentId)!.abnormalExits++;
      }
    } else if (ev.kind === 'breaker' && typeof ev.agentId === 'string' && accumById.has(ev.agentId)) {
      accumById.get(ev.agentId)!.breakerTrips++;
    }
  }

  // 3. Fold session usage into agents
  for (const sess of foldedSessions) {
    const acc = accumById.get(sess.agentId);
    if (!acc) continue;
    acc.input += sess.input;
    acc.output += sess.output;
    acc.cacheRead += sess.cacheRead;
    acc.cacheCreation += sess.cacheCreation;
    acc.usd += sess.usd;
    if (sess.model && sess.model !== 'default' && (!acc.meta.model || acc.meta.model === 'default')) {
      acc.meta.model = sess.model;
    }
  }

  // 4. Fold tool spans into agents
  if (input.toolSpans) {
    for (const [agentId, spans] of Object.entries(input.toolSpans)) {
      const acc = accumById.get(agentId);
      if (!acc || !Array.isArray(spans)) continue;
      for (const s of spans) {
        acc.toolCalls++;
        if (s.success) acc.toolSuccesses++;
        if (typeof s.durationMs === 'number' && s.durationMs >= 0) {
          acc.toolDurationMsSum += s.durationMs;
        }
      }
    }
  }

  // Compute fleet median cost per completed unit & work tokens per completed unit
  const unitCosts: number[] = [];
  const unitWorkTokens: number[] = [];
  for (const acc of accumById.values()) {
    const units = Math.max(acc.tasksDone, acc.messagesDone);
    const workTok = acc.input + acc.output + acc.cacheCreation;
    if (units > 0 && acc.usd > 0) unitCosts.push(acc.usd / units);
    if (units > 0 && workTok > 0) unitWorkTokens.push(workTok / units);
  }
  const medianUsdPerUnit = median(unitCosts) ?? 0.25;
  const medianWorkTokPerUnit = median(unitWorkTokens) ?? 80_000;

  // 5. Build AgentScorecards
  const scorecards: AgentScorecard[] = [];
  for (const acc of accumById.values()) {
    const completedUnits = Math.max(acc.tasksDone, acc.messagesDone);
    const workTokens = acc.input + acc.output + acc.cacheCreation;
    const totalTokens = workTokens + acc.cacheRead;
    const cacheDenom = acc.input + acc.cacheRead + acc.cacheCreation;
    const cacheHitRate = cacheDenom > 0 ? acc.cacheRead / cacheDenom : 0;

    // 1) Completion score (0..100): combines Bayesian-smoothed task completion rate + volume bonus
    const rawCompletionRate = acc.tasksAssigned > 0
      ? (acc.tasksDone + 1) / (acc.tasksAssigned + 2)
      : completedUnits > 0 ? 0.8 : 0.5;
    const volumeBonus = Math.min(20, completedUnits * 4);
    const blockedPenalty = acc.tasksAssigned > 0 ? (acc.tasksBlocked / acc.tasksAssigned) * 15 : 0;
    const completionScore = clamp(Math.round(rawCompletionRate * 82 + volumeBonus - blockedPenalty), 0, 100);

    // 2) First-pass autonomy score (0..100)
    const frictionEvents = acc.tasksWithHumanQA + acc.messagesRefused + acc.breakerTrips;
    const autonomyDenom = Math.max(1, completedUnits + frictionEvents);
    const autonomyRate = completedUnits > 0
      ? clamp(completedUnits / autonomyDenom, 0, 1)
      : frictionEvents > 0 ? 0.3 : 1;
    const autonomyScore = Math.round(autonomyRate * 100);

    // 3) Efficiency score (0..100): cost/token per completed unit vs fleet median + cache hit bonus
    const usdPerUnit = completedUnits > 0 && acc.usd > 0 ? acc.usd / completedUnits : null;
    const workTokensPerUnit = completedUnits > 0 && workTokens > 0 ? Math.round(workTokens / completedUnits) : null;
    let efficiencyScore = 65;
    if (usdPerUnit !== null && medianUsdPerUnit > 0) {
      const ratio = usdPerUnit / medianUsdPerUnit;
      // ratio = 0.5 -> +25 pts; ratio = 1.0 -> 0 pts; ratio = 2.0 -> -25 pts
      efficiencyScore = clamp(Math.round(70 + (1 - ratio) * 35 + cacheHitRate * 15), 15, 100);
    } else if (workTokensPerUnit !== null && medianWorkTokPerUnit > 0) {
      const ratio = workTokensPerUnit / medianWorkTokPerUnit;
      efficiencyScore = clamp(Math.round(70 + (1 - ratio) * 35 + cacheHitRate * 15), 15, 100);
    } else if (cacheDenom > 0) {
      efficiencyScore = clamp(Math.round(60 + cacheHitRate * 25), 30, 90);
    }

    // 4) Reliability & stability score (0..100)
    const toolSuccessRate = acc.toolCalls > 0 ? acc.toolSuccesses / acc.toolCalls : null;
    const avgToolLatencyMs = acc.toolCalls > 0 ? Math.round(acc.toolDurationMsSum / acc.toolCalls) : null;
    const baseToolScore = toolSuccessRate !== null ? toolSuccessRate * 100 : 88;
    const stabilityPenalty = acc.abnormalExits * 12 + acc.breakerTrips * 10;
    const reliabilityScore = clamp(Math.round(baseToolScore - stabilityPenalty), 0, 100);

    // 5) Cycle time / speed score (0..100)
    const avgDurationMs = acc.durationsMs.length > 0
      ? Math.round(acc.durationsMs.reduce((s, v) => s + v, 0) / acc.durationsMs.length)
      : null;
    // Reference turnaround: 10 minutes (600,000 ms) -> ~78 pts
    const speedScore = avgDurationMs !== null
      ? clamp(Math.round(95 - (avgDurationMs / 600_000) * 20), 25, 98)
      : 70;

    // Raw weighted composite score
    const rawComposite =
      0.30 * completionScore +
      0.25 * autonomyScore +
      0.20 * efficiencyScore +
      0.15 * reliabilityScore +
      0.10 * speedScore;

    // Confidence shrinkage toward a 58-pt prior so untested agents don't outrank proven ones
    const evidenceCount = acc.tasksAssigned + acc.messagesDone + (acc.toolCalls >= 5 ? 1 : 0);
    const confidenceWeight = clamp(evidenceCount / 3, 0, 1);
    const prior = 55 - Math.min(20, stabilityPenalty);
    const compositeScore = clamp(
      Math.round(prior * (1 - confidenceWeight) + rawComposite * confidenceWeight),
      0,
      100
    );

    const confidence: 'low' | 'medium' | 'high' =
      evidenceCount >= 4 ? 'high' : evidenceCount >= 2 ? 'medium' : 'low';

    // Per-category performance & scores
    for (const cat of TASK_CATEGORIES) {
      const c = acc.categories[cat];
      c.completedUnits = Math.max(c.tasksDone, c.messagesDone);
      c.completionRate = c.tasksAssigned > 0
        ? c.tasksDone / c.tasksAssigned
        : c.completedUnits > 0 ? 1 : 0;

      const catEvidence = c.tasksAssigned + c.messagesDone;
      if (catEvidence === 0 && !c.roleMatch) {
        c.score = 0;
      } else {
        const catSuccessRatio = c.tasksAssigned > 0
          ? (c.tasksDone + 0.75) / (c.tasksAssigned + 1)
          : c.completedUnits > 0 ? 0.9 : 0.65;
        const catVolumeBonus = Math.min(22, c.completedUnits * 6);
        const roleBonus = c.roleMatch ? 10 : 0;
        const catBlockedPenalty = c.tasksBlocked * 10;
        c.score = clamp(
          Math.round(
            catSuccessRatio * 50 +
            (compositeScore * 0.30) +
            catVolumeBonus +
            roleBonus -
            catBlockedPenalty
          ),
          5,
          100
        );
      }
    }

    const topCategories = TASK_CATEGORIES
      .filter((cat) => cat !== 'general' && acc.categories[cat].score > 0)
      .sort((a, b) => acc.categories[b].score - acc.categories[a].score)
      .slice(0, 3);

    scorecards.push({
      agentId: acc.meta.id,
      name: acc.meta.name || acc.meta.id,
      role: acc.meta.role,
      provider: acc.meta.provider || 'claude',
      model: acc.meta.model || 'default',
      archived: !!acc.meta.archived,
      isOrchestrator: !!acc.meta.isOrchestrator,
      compositeScore,
      completionScore,
      autonomyScore,
      efficiencyScore,
      reliabilityScore,
      speedScore,
      confidence,
      tasksAssigned: acc.tasksAssigned,
      tasksDone: acc.tasksDone,
      tasksDoing: acc.tasksDoing,
      tasksBlocked: acc.tasksBlocked,
      messagesDone: acc.messagesDone,
      messagesRefused: acc.messagesRefused,
      humanEscalations: acc.tasksWithHumanQA,
      completedUnits,
      autonomyRate,
      avgDurationMs,
      lifetimeUsd: acc.usd,
      workTokens,
      totalTokens,
      cacheHitRate,
      usdPerUnit,
      workTokensPerUnit,
      toolCalls: acc.toolCalls,
      toolSuccessRate,
      avgToolLatencyMs,
      abnormalExits: acc.abnormalExits,
      breakerTrips: acc.breakerTrips,
      categories: acc.categories,
      topCategories
    });
  }

  // Sort agents: non-orchestrator workers with highest compositeScore first, then by completedUnits
  scorecards.sort((a, b) => {
    if (a.isOrchestrator !== b.isOrchestrator) return a.isOrchestrator ? 1 : -1;
    if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
    return b.completedUnits - a.completedUnits;
  });

  // 6. Build ModelScorecards (aggregated by provider + model)
  const modelMap = new Map<string, {
    provider: string;
    model: string;
    agents: AgentScorecard[];
  }>();

  for (const sc of scorecards) {
    const provider = sc.provider || 'claude';
    const model = sc.model || 'default';
    const key = `${provider}:${model}`;
    let entry = modelMap.get(key);
    if (!entry) {
      entry = { provider, model, agents: [] };
      modelMap.set(key, entry);
    }
    entry.agents.push(sc);
  }

  const models: ModelScorecard[] = [];
  for (const [key, entry] of modelMap.entries()) {
    const list = entry.agents;
    const completedUnits = list.reduce((s, a) => s + a.completedUnits, 0);
    const tasksDone = list.reduce((s, a) => s + a.tasksDone, 0);
    const tasksAssigned = list.reduce((s, a) => s + a.tasksAssigned, 0);
    const lifetimeUsd = list.reduce((s, a) => s + a.lifetimeUsd, 0);
    const workTokens = list.reduce((s, a) => s + a.workTokens, 0);
    const totalTokens = list.reduce((s, a) => s + a.totalTokens, 0);
    const totalCacheRead = list.reduce((s, a) => s + (a.totalTokens - a.workTokens), 0);
    const cacheDenom = totalTokens;
    const cacheHitRate = cacheDenom > 0 ? totalCacheRead / cacheDenom : 0;
    const toolCalls = list.reduce((s, a) => s + a.toolCalls, 0);
    const weightedToolSuccess = list.reduce(
      (s, a) => s + (a.toolSuccessRate !== null ? a.toolSuccessRate * a.toolCalls : 0),
      0
    );
    const abnormalExits = list.reduce((s, a) => s + a.abnormalExits, 0);
    const breakerTrips = list.reduce((s, a) => s + a.breakerTrips, 0);
    const compositeScore = Math.round(
      list.reduce((s, a) => s + a.compositeScore, 0) / Math.max(1, list.length)
    );
    const autonomyRate =
      list.reduce((s, a) => s + a.autonomyRate, 0) / Math.max(1, list.length);

    models.push({
      key,
      provider: entry.provider,
      model: entry.model,
      agentCount: list.length,
      completedUnits,
      tasksDone,
      tasksAssigned,
      compositeScore,
      autonomyRate,
      lifetimeUsd,
      workTokens,
      cacheHitRate,
      usdPerUnit: completedUnits > 0 && lifetimeUsd > 0 ? lifetimeUsd / completedUnits : null,
      workTokensPerUnit: completedUnits > 0 && workTokens > 0 ? Math.round(workTokens / completedUnits) : null,
      toolCalls,
      toolSuccessRate: toolCalls > 0 ? weightedToolSuccess / toolCalls : null,
      abnormalExits,
      breakerTrips
    });
  }

  models.sort((a, b) => {
    if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
    return b.completedUnits - a.completedUnits;
  });

  // 7. Build Category Leaders Matrix ("Who is objectively best at each domain?")
  const workerCandidates = scorecards.filter((a) => !a.isOrchestrator);
  const pool = workerCandidates.length > 0 ? workerCandidates : scorecards;
  const categoryLeaders = {} as Record<TaskCategory, CategoryLeader>;

  for (const cat of TASK_CATEGORIES) {
    const ranked = [...pool]
      .map((agent) => {
        const perf = agent.categories[cat];
        // Rank primarily by category score, falling back to overall compositeScore when untested in category
        const effectiveScore = perf.score > 0
          ? perf.score
          : Math.round(agent.compositeScore * 0.65);
        return { agent, perf, effectiveScore };
      })
      .filter((r) => r.perf.score > 0 || (cat === 'general' && r.agent.completedUnits > 0))
      .sort((a, b) => {
        if (b.effectiveScore !== a.effectiveScore) return b.effectiveScore - a.effectiveScore;
        if (b.perf.completedUnits !== a.perf.completedUnits) return b.perf.completedUnits - a.perf.completedUnits;
        return b.agent.compositeScore - a.agent.compositeScore;
      });

    const winner = ranked[0];
    const runnerUp = ranked[1];

    if (!winner) {
      categoryLeaders[cat] = {
        category: cat,
        leaderAgentId: null,
        leaderName: null,
        leaderProvider: null,
        leaderModel: null,
        leaderScore: 0,
        completedUnits: 0,
        tasksDone: 0,
        tasksAssigned: 0,
        usdPerUnit: null,
        autonomyRate: 1,
        runnerUpAgentId: null,
        runnerUpName: null,
        runnerUpScore: null,
        rationale: 'No tasks recorded in this category yet'
      };
      continue;
    }

    const parts: string[] = [];
    if (winner.perf.tasksAssigned > 0) {
      parts.push(`${winner.perf.tasksDone}/${winner.perf.tasksAssigned} tasks done`);
    } else if (winner.perf.completedUnits > 0) {
      parts.push(`${winner.perf.completedUnits} completed`);
    } else if (winner.perf.roleMatch) {
      parts.push('role specialist');
    }
    parts.push(`${Math.round(winner.agent.autonomyRate * 100)}% autonomous`);
    if (winner.agent.usdPerUnit !== null) {
      parts.push(`$${winner.agent.usdPerUnit.toFixed(2)}/unit`);
    }

    categoryLeaders[cat] = {
      category: cat,
      leaderAgentId: winner.agent.agentId,
      leaderName: winner.agent.name,
      leaderProvider: winner.agent.provider,
      leaderModel: winner.agent.model,
      leaderScore: winner.effectiveScore,
      completedUnits: winner.perf.completedUnits,
      tasksDone: winner.perf.tasksDone,
      tasksAssigned: winner.perf.tasksAssigned,
      usdPerUnit: winner.agent.usdPerUnit,
      autonomyRate: winner.agent.autonomyRate,
      runnerUpAgentId: runnerUp ? runnerUp.agent.agentId : null,
      runnerUpName: runnerUp ? runnerUp.agent.name : null,
      runnerUpScore: runnerUp ? runnerUp.effectiveScore : null,
      rationale: parts.join(' · ')
    };
  }

  // 8. Fleet summary
  const nonOrchestrator = scorecards.filter((a) => !a.isOrchestrator);
  const topAgent = nonOrchestrator[0] ?? scorecards[0] ?? null;
  const topModel = models[0] ?? null;
  const totalTasksAssigned = scorecards.reduce((s, a) => s + a.tasksAssigned, 0);
  const totalTasksDone = scorecards.reduce((s, a) => s + a.tasksDone, 0);
  const totalCompletedUnits = scorecards.reduce((s, a) => s + a.completedUnits, 0);
  const fleetLifetimeUsd = scorecards.reduce((s, a) => s + a.lifetimeUsd, 0);
  const fleetTotalTokens = scorecards.reduce((s, a) => s + a.totalTokens, 0);
  const fleetWorkTokens = scorecards.reduce((s, a) => s + a.workTokens, 0);
  const fleetCacheRead = fleetTotalTokens - fleetWorkTokens;
  const fleetCacheHitRate = fleetTotalTokens > 0 ? fleetCacheRead / fleetTotalTokens : 0;
  const fleetAutonomyRate = scorecards.length > 0
    ? scorecards.reduce((s, a) => s + a.autonomyRate, 0) / scorecards.length
    : 1;

  return {
    generatedAt: now,
    fleetSummary: {
      totalAgents: scorecards.length,
      activeWorkers: scorecards.filter((a) => !a.archived && !a.isOrchestrator).length,
      totalTasksAssigned,
      totalTasksDone,
      totalCompletedUnits,
      fleetAutonomyRate,
      fleetLifetimeUsd,
      fleetTotalTokens,
      fleetCacheHitRate,
      topAgentId: topAgent?.agentId ?? null,
      topAgentName: topAgent?.name ?? null,
      topModelKey: topModel?.key ?? null
    },
    agents: scorecards,
    models,
    categoryLeaders
  };
}

/**
 * Given a free-text task description (e.g. from the Command Center Dispatch box),
 * classify its domain and recommend the best available non-orchestrator agent.
 */
export function recommendAgentForTask(
  promptText: string,
  report: HiveAnalyticsReport | null | undefined,
  liveAgentIds?: string[]
): TaskRecommendation | null {
  if (!report || !promptText || !promptText.trim()) return null;
  const category = classifyTaskCategory(promptText);
  const liveSet = liveAgentIds && liveAgentIds.length > 0 ? new Set(liveAgentIds) : null;

  const candidates = report.agents.filter((a) => {
    if (a.isOrchestrator) return false;
    if (liveSet) return liveSet.has(a.agentId);
    return !a.archived;
  });
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((agent) => {
      const catPerf = agent.categories[category];
      const score = catPerf && catPerf.score > 0
        ? catPerf.score
        : agent.compositeScore;
      return { agent, catPerf, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.agent.completedUnits - a.agent.completedUnits;
    });

  const best = scored[0];
  if (!best) return null;

  const reasons: string[] = [];
  if (best.catPerf && best.catPerf.completedUnits > 0 && category !== 'general') {
    reasons.push(`${best.catPerf.completedUnits} ${category} done`);
  } else if (best.catPerf?.roleMatch && category !== 'general') {
    reasons.push(`${category} role match`);
  } else if (best.agent.completedUnits > 0) {
    reasons.push(`${best.agent.completedUnits} total done`);
  }
  reasons.push(`score ${best.score}`);
  if (best.agent.usdPerUnit !== null) {
    reasons.push(`$${best.agent.usdPerUnit.toFixed(2)}/task`);
  }

  return {
    category,
    agentId: best.agent.agentId,
    agentName: best.agent.name,
    provider: best.agent.provider,
    model: best.agent.model,
    score: best.score,
    confidence: best.agent.confidence,
    rationale: reasons.join(' · ')
  };
}

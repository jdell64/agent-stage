import { buildSpawnCommand, inferAgentProvider, isClaudeProvider, tokenizeCommand } from '@/store/config';
import { useStore, type Agent } from '@/store/store';
import { restartAgentPty } from '@/utils/restartAgent';
import { newAgentId } from '@shared/agentId';
import { squadWorkers, type FloorSquadPreset } from '@shared/floors';

export interface FloorResetResult {
  /** Agents given a fresh session. */
  reset: number;
  /** `name: reason` for each agent that could not be reset. */
  failures: string[];
}

/**
 * Reset every agent on THIS floor: a fresh session (cleared context) for each.
 *
 * It reuses the single-agent "fresh restart" (`restartAgentPty` with `resume:false`),
 * which kills the PTY and respawns it against the SAME hive workspace, so `memory.md`,
 * the inbox/outbox and the registry entry are untouched; only the CLI conversation
 * is dropped. That is the whole point: reset the context, keep the memory.
 *
 * Archived agents have no live session and are left alone.
 */
export async function resetFloorAgents(): Promise<FloorResetResult> {
  const agents = useStore.getState().agents;
  const failures: string[] = [];
  let reset = 0;
  const results = await Promise.allSettled(
    agents.map(async (a) => {
      const res = await restartAgentPty(a, { resume: false });
      if (!res.ok) throw new Error(res.error ?? 'restart failed');
    })
  );
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') reset++;
    else failures.push(`${agents[i].name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  });
  return { reset, failures };
}

function basename(path: string): string {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * Hire a New Floor's starting squad. The orchestrator is not hired here: every
 * window boots its own (useHive). Workers get the user's default engine/model, the
 * floor folder as their cwd and the squad's role brief, then join the roster the
 * same way an Add Agent hire does.
 *
 * Best-effort per agent: one failed spawn never blocks the rest of the squad.
 */
export async function seedFloorSquad(preset: FloorSquadPreset, home: string): Promise<{ hired: number; failures: string[] }> {
  const workers = squadWorkers(preset);
  const failures: string[] = [];
  if (workers.length === 0) return { hired: 0, failures };
  const config = await window.cth.getConfig();
  const provider = inferAgentProvider(config.defaultCommand);
  const model = isClaudeProvider(provider) ? config.defaultModel : undefined;
  const command = buildSpawnCommand(config, model, provider);
  const [exe, ...args] = tokenizeCommand(command.trim());
  let hired = 0;

  for (const member of workers) {
    const id = newAgentId();
    const ptyId = `pty-${id}`;
    try {
      const res = await window.cth.spawnPty({
        id: ptyId,
        cwd: home,
        command: exe,
        provider,
        args,
        cols: 100,
        rows: 30,
        isolate: false,
        hive: { id, name: member.name, provider, command: command.trim(), cwd: home, role: member.role }
      });
      if (!res.ok) throw new Error(res.error ?? 'spawn failed');
      const spawnedCwd = res.cwd || home;
      const agent: Agent = {
        id,
        name: member.name,
        character: member.character as Agent['character'],
        accent: 'sky',
        description: member.role,
        project: basename(spawnedCwd),
        tmuxTarget: '',
        cwd: spawnedCwd,
        status: 'idle',
        action: 'starting up',
        progress: 0,
        currentStation: 'desk',
        ptyId,
        command: command.trim(),
        provider,
        model,
        worktreePath: res.worktreePath,
        seedPrompt: res.seedPrompt,
        recentTextTs: Date.now()
      };
      useStore.getState().addAgent(agent);
      hired++;
    } catch (e) {
      failures.push(`${member.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { hired, failures };
}

import { acquireTerminal, disposeTerminal, resetTerminal } from '@/components/terminalPool';
import {
  applyModelToCommandLine,
  buildSpawnCommand,
  inferAgentProvider,
  providerPreset,
  tokenizeCommand,
  type AgentProvider,
} from '@/store/config';
import { useStore, type Agent } from '@/store/store';
import { roleForHiveSpawn } from '@shared/agentRole';

export interface RestartAgentOptions {
  /** Override model; defaults to `agent.model`. */
  model?: string;
  /** Override provider; defaults to the agent's current provider. */
  provider?: AgentProvider;
  /** Whether to reattach the prior CLI conversation (`--resume <sessionId>`). */
  resume?: boolean;
  /**
   * When true, if `--resume` cannot be used (no sessionId recorded yet,
   * transcript missing on disk, or provider does not support resume),
   * automatically fall back to a fresh session instead of throwing.
   *
   * Defaults to `true` when `resume: true` so an agent killed via `Ctrl-C`
   * before its first hook event recorded a `sessionId` can still be restarted
   * in one click instead of leaving the dead terminal stuck.
   */
  resumeOptional?: boolean;
}

export interface RestartAgentResult {
  ok: boolean;
  resumed: boolean;
  fellBackToFresh: boolean;
  error?: string;
}

/**
 * Restart an agent's PTY in place (or spawn a fresh PTY for an archived agent).
 *
 * Shared by:
 * - `CommandCenterPanel` (Monitor tab `restart & continue`, model switcher, and `Archived` restore)
 * - `AgentControlStrip` (per-agent `restart & continue` button in docked & fullscreen views)
 * - `PtyTerminalView` (inline `restart & continue` / `fresh restart` controls when a terminal exits)
 */
export async function restartAgentPty(
  agent: Agent,
  opts: RestartAgentOptions = {}
): Promise<RestartAgentResult> {
  const ptyId = agent.ptyId || `pty-${agent.id}`;
  const model = 'model' in opts ? opts.model : agent.model;
  const resumeOptional = opts.resumeOptional ?? true;

  try {
    const cfg = await window.cth.getConfig();
    const previousProvider = inferAgentProvider(agent.command, agent.provider);
    const provider = opts.provider ?? previousProvider;
    const preset = providerPreset(provider);
    const providerSupportsResume =
      provider === 'claude' || Boolean(preset.resumeFlag || preset.resumeSubcommand);

    let resume = opts.resume === true && provider === previousProvider && providerSupportsResume;
    let fellBackToFresh = false;

    if (opts.resume && !resume) {
      if (!resumeOptional) {
        throw new Error(
          provider !== previousProvider
            ? 'Cannot resume a session through a different provider.'
            : `${preset.label} does not support resuming sessions.`
        );
      }
      fellBackToFresh = true;
    }

    let resumeSessionId: string | undefined;
    const registry = await window.cth.hiveRegistry().catch(() => null);
    if (resume) {
      const giveUpOnResume = (reason: string) => {
        if (!resumeOptional) throw new Error(reason);
        resume = false;
        resumeSessionId = undefined;
        fellBackToFresh = true;
      };
      resumeSessionId = registry?.agents?.[agent.id]?.sessionId;
      if (!resumeSessionId) {
        giveUpOnResume('No recorded session ID; current process was left running.');
      } else if (provider === 'claude' && !(await window.cth.resolveSessionCwd(resumeSessionId))) {
        giveUpOnResume('Session transcript not found; current process was left running.');
      }
    }

    // Preserve the agent's isolated git worktree when it still exists on disk.
    let cwd = agent.cwd;
    let worktreeGone = false;
    if (agent.worktreePath) {
      if (await window.cth.gitIsRepo(agent.worktreePath)) {
        cwd = agent.worktreePath;
      } else {
        worktreeGone = true;
      }
    }

    // Measure the live terminal grid before stopping the existing PTY.
    const oldEntry = acquireTerminal(ptyId);
    let cols = oldEntry.term.cols || 100;
    let rows = oldEntry.term.rows || 30;
    try {
      oldEntry.fit.fit();
      cols = oldEntry.term.cols || cols;
      rows = oldEntry.term.rows || rows;
    } catch {
      /* host not sized yet */
    }

    const killed = await window.cth.killPty(ptyId, { preserveWorktree: true });
    // A pty that is ALREADY gone (crash or Ctrl-C twice) answers `no pty: <id>`,
    // which is the state killPty was trying to reach.
    if (!killed.ok && !/^no pty:/.test(killed.error ?? '')) {
      throw new Error(killed.error ?? 'Could not stop the current process.');
    }

    if (!resume) {
      resetTerminal(ptyId);
    }

    const savedCommand =
      (agent.command ?? '').trim() || (registry?.agents?.[agent.id]?.command ?? '').trim();
    const command =
      applyModelToCommandLine(savedCommand, model, provider) ??
      buildSpawnCommand(cfg, model, provider);
    const [exe, ...args] = tokenizeCommand(command.trim());

    const hive = {
      id: agent.id,
      name: agent.name,
      cwd,
      provider,
      command: command.trim(),
      isOrchestrator: agent.isOrchestrator,
      isAssistant: agent.isAssistant,
      role: roleForHiveSpawn(agent),
    };

    const res = await window.cth.spawnPty({
      id: ptyId,
      cwd,
      command: exe,
      args,
      provider,
      cols,
      rows,
      isolate: false,
      hive,
      resume,
      resumeSessionId,
      requireResume: resume && !resumeOptional,
    });

    if (!res.ok) {
      throw new Error(res.error ?? 'Restart failed.');
    }
    const actuallyResumed = Boolean(resume && res.resumed === true);
    if (resume && !actuallyResumed && !resumeOptional) {
      throw new Error('Resume was refused; no replacement session was accepted.');
    }
    if (resume && !actuallyResumed) {
      fellBackToFresh = true;
    }

    // Recreate the pooled terminal when resuming (or when recovering from an exited terminal)
    // so any stale renderer/DOM/exit state is wiped cleanly.
    if (actuallyResumed) {
      disposeTerminal(ptyId);
      acquireTerminal(ptyId);
    } else {
      resetTerminal(ptyId);
    }

    const store = useStore.getState();
    const isArchived = store.archivedAgents.some((a) => a.id === agent.id);
    const nextGeneration = (agent.terminalGeneration ?? 0) + (actuallyResumed ? 1 : 0);
    const actionLabel = actuallyResumed
      ? 'continuing…'
      : fellBackToFresh
      ? 'restarted (fresh session)…'
      : provider === previousProvider
      ? 'restarting…'
      : `switching to ${preset.label}…`;

    const updatedFields: Partial<Agent> = {
      ptyId,
      archived: false,
      command: command.trim(),
      provider,
      model,
      status: 'idle',
      action: actionLabel,
      terminalGeneration: nextGeneration,
      ...(worktreeGone ? { worktreePath: undefined } : {}),
      ...(res.remoteControlSessionName
        ? { remoteControlSessionName: res.remoteControlSessionName }
        : {}),
    };

    if (isArchived) {
      store.addAgent({
        ...agent,
        ...updatedFields,
      });
    } else {
      store.updateAgent(agent.id, updatedFields);
    }

    return {
      ok: true,
      resumed: actuallyResumed,
      fellBackToFresh,
    };
  } catch (error) {
    return {
      ok: false,
      resumed: false,
      fellBackToFresh: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

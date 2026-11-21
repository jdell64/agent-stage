import type { AgentProvider } from './agentProvider';

export type InterruptProvider = AgentProvider | undefined;

export interface InterruptResult {
  ok: boolean;
  error?: string;
}

/** Bind a hive's orchestrator interrupt route to that floor's PTY ownership. */
export function installScopedInterruptHandler<THive, TOwner>(
  hive: { setInterruptHandler(handler: (agentId: string) => InterruptResult): void },
  ptyToAgent: Map<string, string>,
  owner: () => TOwner,
  execute: (agentId: string, hive: THive, ptyToAgent: Map<string, string>, owner: TOwner) => InterruptResult
): void {
  hive.setInterruptHandler((agentId) => execute(agentId, hive as THive, ptyToAgent, owner()));
}

/** Claude stops the active turn with Escape; other interactive engines use one Ctrl+C. */
export function interruptKeyForProvider(provider: InterruptProvider): string {
  return provider === 'claude' ? '\u001b' : '\u0003';
}

export function interruptKeyNameForProvider(provider: InterruptProvider): string {
  return provider === 'claude' ? 'Esc' : 'Ctrl+C';
}

export function claimInterrupt(
  agentId: string,
  now: number,
  lastAt: Map<string, number>,
  debounceMs: number
): boolean {
  if (now - (lastAt.get(agentId) ?? 0) < debounceMs) return false;
  lastAt.set(agentId, now);
  return true;
}

export function interruptAuditBody(provider: InterruptProvider): string {
  const key = interruptKeyNameForProvider(provider);
  return `The operator interrupted your current task with ${key}. Your PTY and session remain alive; continue when ready.`;
}

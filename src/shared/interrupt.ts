import type { AgentProvider } from './agentProvider';

export type InterruptProvider = AgentProvider | undefined;

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

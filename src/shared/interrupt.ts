export type InterruptProvider = 'claude' | 'codex' | 'other' | undefined;

/** Claude stops the active turn with Escape; other interactive engines use one Ctrl+C. */
export function interruptKeyForProvider(provider: InterruptProvider): string {
  return provider === 'claude' ? '\u001b' : '\u0003';
}

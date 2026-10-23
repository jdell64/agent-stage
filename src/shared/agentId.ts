/** Create an opaque identity for a newly hired agent. Display names can change
 *  freely without changing the registry, mailbox, or worktree key. */
export function newAgentId(): string {
  return `agent-${globalThis.crypto.randomUUID()}`;
}

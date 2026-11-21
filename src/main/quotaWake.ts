export interface QuotaWakeState {
  agentId: string;
  engine: string;
  resetAt: number;
  inboxIds: string[];
  attempts: number;
  nextAt: number;
  baselineActivityAt: number;
}
export type PersistedQuotaWake = Pick<QuotaWakeState, 'agentId' | 'engine' | 'resetAt' | 'inboxIds' | 'attempts' | 'nextAt' | 'baselineActivityAt'>;

export interface QuotaWakeFacts {
  agentId: string;
  ptyId?: string;
  idle: boolean;
  onHold?: boolean;
  lastActivityAt?: number;
}

export type QuotaWakeAction =
  | { kind: 'wake'; agentId: string; inboxIds: string[]; attempt: number }
  | { kind: 'failed'; agentId: string; attempts: number };

export const QUOTA_WAKE_JITTER_MS = 15_000;
export const QUOTA_WAKE_IDLE_MS = 12_000;
export const QUOTA_WAKE_RETRY_MS = 5 * 60_000;
export const QUOTA_WAKE_MAX_ATTEMPTS = 3;

export function clearInboxWakeDedup(seen: Set<string>, ids: readonly string[]): void {
  for (const id of ids) seen.delete(id);
}

export function markQuotaNoticeSeen(tails: Map<string, string>, agentId: string, data: string): boolean {
  const tail = ((tails.get(agentId) ?? '') + data).slice(-4_000);
  tails.set(agentId, tail);
  return looksLikeQuotaNotice(tail);
}

/** Main-process, bounded wake-on-reset state machine. */
export class QuotaWakeScheduler {
  private states = new Map<string, QuotaWakeState>();

  schedule(agentId: string, engine: string, resetAt: number, inboxIds: readonly string[], now = Date.now()): void {
    if (!agentId || !Number.isFinite(resetAt) || resetAt <= now) return;
    this.states.set(agentId, {
      agentId, engine, resetAt, inboxIds: [...new Set(inboxIds.filter(Boolean))], attempts: 0,
      nextAt: resetAt + QUOTA_WAKE_JITTER_MS, baselineActivityAt: 0
    });
  }

  clear(agentId: string): void { this.states.delete(agentId); }
  agentIds(): string[] { return [...this.states.keys()]; }
  snapshot(): PersistedQuotaWake[] { return [...this.states.values()].map((s) => ({ ...s, inboxIds: [...s.inboxIds] })); }
  restore(states: readonly PersistedQuotaWake[], now = Date.now()): void {
    this.states.clear();
    for (const s of states) {
      if (!s || typeof s.agentId !== 'string' || !Number.isFinite(s.resetAt) || !Number.isFinite(s.nextAt) || s.resetAt <= now) continue;
      this.states.set(s.agentId, { ...s, inboxIds: Array.isArray(s.inboxIds) ? s.inboxIds.filter((id) => typeof id === 'string') : [] });
    }
  }
  refreshInbox(agentId: string, ids: readonly string[]): void {
    const state = this.states.get(agentId);
    if (!state) return;
    state.inboxIds = [...new Set([...state.inboxIds, ...ids.filter(Boolean)])];
  }
  get(agentId: string): Readonly<QuotaWakeState> | undefined { return this.states.get(agentId); }

  tick(facts: readonly QuotaWakeFacts[], now = Date.now()): QuotaWakeAction[] {
    const byId = new Map(facts.map((f) => [f.agentId, f]));
    const actions: QuotaWakeAction[] = [];
    for (const [id, state] of this.states) {
      const f = byId.get(id);
      if (!f?.ptyId || f.onHold) continue;
      if (state.attempts > 0 && (f.lastActivityAt ?? 0) > state.baselineActivityAt) {
        this.states.delete(id);
        continue;
      }
      if (now < state.nextAt || !f.idle) continue;
      if (state.attempts >= QUOTA_WAKE_MAX_ATTEMPTS) {
        actions.push({ kind: 'failed', agentId: id, attempts: state.attempts });
        this.states.delete(id);
        continue;
      }
      state.attempts++;
      state.baselineActivityAt = f.lastActivityAt ?? now;
      state.nextAt = now + QUOTA_WAKE_RETRY_MS;
      actions.push({ kind: 'wake', agentId: id, inboxIds: [...state.inboxIds], attempt: state.attempts });
    }
    return actions;
  }
}

const QUOTA_NOTICE = /(?:you(?:'|’)ve hit (?:your )?(?:usage )?limit|usage limit (?:reached|exceeded)|out of (?:tokens|credits)|quota exceeded|rate limit reached)/i;
export function looksLikeQuotaNotice(text: string): boolean { return QUOTA_NOTICE.test(text); }

/** Read a normalized or raw usage-availability record and choose its next reset. */
export function resetAtForEngine(raw: unknown, engine: string): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const agents = (raw as Record<string, unknown>).agents;
  if (!agents || typeof agents !== 'object') return null;
  const item = (agents as Record<string, unknown>)[engine];
  if (!item || typeof item !== 'object') return null;
  const windows = (item as Record<string, unknown>).windows;
  if (!windows || typeof windows !== 'object') return null;
  const resets = Object.values(windows as Record<string, unknown>).flatMap((w) => {
    if (!w || typeof w !== 'object') return [];
    const v = (w as Record<string, unknown>).resetsAt ?? (w as Record<string, unknown>).resets_at;
    const t = typeof v === 'string' ? Date.parse(v) : NaN;
    const pct = Number((w as Record<string, unknown>).remainingPct ?? (w as Record<string, unknown>).remaining_pct);
    return Number.isFinite(t) ? [{ t, pct: Number.isFinite(pct) ? pct : 100 }] : [];
  }).filter((r) => r.t > Date.now()).sort((a, b) => a.pct - b.pct || a.t - b.t);
  return resets[0]?.t ?? null;
}

export function usageEngineForProvider(provider: string): string {
  return provider === 'antigravity' ? 'gemini_argon' : provider;
}

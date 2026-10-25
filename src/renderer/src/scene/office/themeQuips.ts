import type { ThemeQuips, ThemeQuipStatus } from '@shared/themePack';

export const FLAVOR_BUBBLE_MAX_VISIBLE = 2;
export const FLAVOR_BUBBLE_VISIBLE_MS = 7_000;
export const FLAVOR_QUIP_MIN_INTERVAL_MS = 18_000;
export const FLAVOR_QUIP_MAX_INTERVAL_MS = 32_000;

/** Floor-wide gate for ambient/theme-independent flavor bubbles. */
export class FlavorBubbleBudget {
  private readonly active = new Map<string, number>();
  private readonly nextAllowed = new Map<string, number>();

  constructor(
    private readonly maxVisible = FLAVOR_BUBBLE_MAX_VISIBLE,
    private readonly visibleMs = FLAVOR_BUBBLE_VISIBLE_MS,
    private readonly minIntervalMs = FLAVOR_QUIP_MIN_INTERVAL_MS,
    private readonly maxIntervalMs = FLAVOR_QUIP_MAX_INTERVAL_MS,
    private readonly random: () => number = Math.random,
  ) {}

  tryClaim(id: string, now: number): boolean {
    for (const [activeId, until] of this.active) {
      if (until <= now) this.active.delete(activeId);
    }
    if (this.active.has(id) || (this.nextAllowed.get(id) ?? 0) > now) return false;
    if (this.active.size >= this.maxVisible) return false;
    this.active.set(id, now + this.visibleMs);
    const interval = this.minIntervalMs + Math.max(0, Math.min(1, this.random()))
      * (this.maxIntervalMs - this.minIntervalMs);
    this.nextAllowed.set(id, now + interval);
    return true;
  }

  release(id: string): void {
    this.active.delete(id);
  }
}

export interface BubbleLayout {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Return deterministic upward lifts that keep overlapping bubble rectangles apart. */
export function resolveBubbleLifts(items: readonly BubbleLayout[], pad = 2): Map<string, number> {
  const lifts = new Map(items.map((item) => [item.id, 0]));
  const ordered = [...items].sort((a, b) => (b.y + b.h) - (a.y + a.h) || a.x - b.x || a.id.localeCompare(b.id));
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const item of ordered) {
    let y = item.y;
    for (let pass = 0; pass < ordered.length + 1; pass++) {
      let moved = false;
      for (const previous of placed) {
        const overlapX = item.x < previous.x + previous.w + pad && item.x + item.w + pad > previous.x;
        const overlapY = y < previous.y + previous.h + pad && y + item.h + pad > previous.y;
        if (overlapX && overlapY) { y = previous.y - item.h - pad; moved = true; }
      }
      if (!moved) break;
    }
    placed.push({ x: item.x, y, w: item.w, h: item.h });
    lifts.set(item.id, item.y - y);
  }
  return lifts;
}

/** Keep real activity authoritative; theme banter is only occasional without a live action. */
export function shouldShowWorkingQuip(hasFreshActivity: boolean, random: () => number = Math.random): boolean {
  return !hasFreshActivity && random() < 0.2;
}

/** Pick from the existing generic pool plus the active theme's additions. */
export function pickQuip(
  genericLines: readonly string[],
  quips: ThemeQuips | undefined,
  status: ThemeQuipStatus,
  character: string,
  previous: string | undefined,
  random: () => number = Math.random,
): string {
  const themed = [
    ...(quips?.byStatus?.[status] ?? []),
    ...(quips?.byCharacter && Object.prototype.hasOwnProperty.call(quips.byCharacter, character.toLowerCase())
      ? quips.byCharacter[character.toLowerCase()] ?? []
      : []),
  ];
  const pool = [...new Set([...genericLines, ...themed])];
  const withoutRepeat = pool.filter((line) => line !== previous);
  const choices = withoutRepeat.length ? withoutRepeat : pool;
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] ?? '';
}

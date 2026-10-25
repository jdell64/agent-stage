import { describe, expect, it } from 'vitest';
import {
  FlavorBubbleBudget,
  pickQuip,
  resolveBubbleLifts,
  shouldShowWorkingQuip,
} from '../../src/renderer/src/scene/office/themeQuips';

describe('theme quips', () => {
  it('adds status and character lines to the generic pool', () => {
    const picked = pickQuip(['generic'], {
      byStatus: { working: ['theme status'] },
      byCharacter: { picard: ['theme character'] },
    }, 'working', 'Picard', undefined, () => 0.99);
    expect(picked).toBe('theme character');
  });

  it('avoids repeating the previous line when alternatives exist', () => {
    expect(pickQuip(['same', 'other'], undefined, 'idle', 'picard', 'same', () => 0)).toBe('other');
    expect(pickQuip(['only'], undefined, 'idle', 'picard', 'only', () => 0)).toBe('only');
  });

  it('does not offer another character’s lines', () => {
    expect(pickQuip(['generic'], { byCharacter: { picard: ['captain'] } }, 'idle', 'troi', undefined, () => 0.99))
      .toBe('generic');
  });

  it('only occasionally permits a working quip, and never over fresh activity', () => {
    expect(shouldShowWorkingQuip(true, () => 0)).toBe(false);
    expect(shouldShowWorkingQuip(false, () => 0.19)).toBe(true);
    expect(shouldShowWorkingQuip(false, () => 0.2)).toBe(false);
  });

  it('uses the done status pool for ambient completion quips', () => {
    expect(pickQuip(['generic'], { byStatus: { done: ['Finished!'] } }, 'done', 'Troi', undefined, () => 0.99))
      .toBe('Finished!');
  });

  it('caps flavor bubbles and spaces each agent onto a longer random interval', () => {
    const budget = new FlavorBubbleBudget(2, 7_000, 18_000, 32_000, () => 0);
    expect(budget.tryClaim('worf', 0)).toBe(true);
    expect(budget.tryClaim('crusher', 0)).toBe(true);
    expect(budget.tryClaim('troi', 0)).toBe(false);
    expect(budget.tryClaim('worf', 17_999)).toBe(false);
    expect(budget.tryClaim('troi', 7_001)).toBe(true);
    expect(budget.tryClaim('crusher', 7_001)).toBe(false);
    expect(budget.tryClaim('crusher', 18_001)).toBe(true);
  });

  it('stacks overlapping bubble layouts without overlap', () => {
    const lifts = resolveBubbleLifts([
      { id: 'worf', x: 100, y: 100, w: 80, h: 24 },
      { id: 'crusher', x: 102, y: 101, w: 80, h: 24 },
      { id: 'troi', x: 104, y: 102, w: 80, h: 24 },
    ]);
    expect(lifts.get('troi')).toBe(0);
    expect(lifts.get('crusher')).toBeGreaterThan(0);
    expect(lifts.get('worf')).toBeGreaterThan(lifts.get('crusher')!);
  });
});

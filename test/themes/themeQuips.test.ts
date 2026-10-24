import { describe, expect, it } from 'vitest';
import { pickQuip, shouldShowWorkingQuip } from '../../src/renderer/src/scene/office/themeQuips';

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
});

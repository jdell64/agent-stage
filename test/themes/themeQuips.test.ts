import { describe, expect, it } from 'vitest';
import { pickQuip } from '../../src/renderer/src/scene/office/themeQuips';

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
});

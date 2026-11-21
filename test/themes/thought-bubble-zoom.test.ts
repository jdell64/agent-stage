import { describe, expect, it } from 'vitest';
import { THOUGHT_BUBBLE_MIN_ZOOM, thoughtBubblesVisible } from '../../src/renderer/src/scene/office/bubbleScale';

describe('thought bubble zoom visibility', () => {
  it('keeps bubbles at or above the readable zoom threshold', () => {
    expect(thoughtBubblesVisible(THOUGHT_BUBBLE_MIN_ZOOM)).toBe(true);
    expect(thoughtBubblesVisible(1)).toBe(true);
  });

  it('hides bubbles when the floor is zoomed out to map view', () => {
    expect(thoughtBubblesVisible(THOUGHT_BUBBLE_MIN_ZOOM - 0.01)).toBe(false);
    expect(thoughtBubblesVisible(0)).toBe(false);
    expect(thoughtBubblesVisible(Number.NaN)).toBe(false);
  });
});

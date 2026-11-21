/** Cancel the camera transform applied to the world-layer bubble. */
export function bubbleCounterScale(zoom: number): number {
  return zoom > 0 && Number.isFinite(zoom) ? 1 / zoom : 1;
}

/** Thought text is noise once the whole floor is zoomed far enough out to be
 * viewed as a map. Keep the threshold in one place for scene and tests. */
export const THOUGHT_BUBBLE_MIN_ZOOM = 0.72;

export function thoughtBubblesVisible(zoom: number): boolean {
  return Number.isFinite(zoom) && zoom >= THOUGHT_BUBBLE_MIN_ZOOM;
}

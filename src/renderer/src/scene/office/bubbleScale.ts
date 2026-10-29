/** Cancel the camera transform applied to the world-layer bubble. */
export function bubbleCounterScale(zoom: number): number {
  return zoom > 0 && Number.isFinite(zoom) ? 1 / zoom : 1;
}

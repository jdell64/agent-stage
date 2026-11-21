export interface SecondaryFloorGoneCleanup {
  isPrimary: boolean;
  isCurrent(): boolean;
  detachView(): void;
  killOwnerPtys(): void;
  stopServices(): void;
  removeRuntime(): void;
  activateFallback(): void;
  broadcast(): void;
}

/** Tear down one secondary floor when its renderer is lost unexpectedly. */
export function cleanupSecondaryFloorAfterContentsGone(cleanup: SecondaryFloorGoneCleanup): boolean {
  if (cleanup.isPrimary || !cleanup.isCurrent()) return false;

  try { cleanup.detachView(); } catch { /* host may already be closing */ }
  try { cleanup.killOwnerPtys(); } catch { /* best-effort process cleanup */ }
  try { cleanup.stopServices(); } catch { /* continue removing the dead runtime */ }
  cleanup.removeRuntime();
  cleanup.activateFallback();
  cleanup.broadcast();
  return true;
}

/** Register both terminal lifecycle signals, but run cleanup only once. */
export function registerSecondaryFloorGoneHandlers(
  onDestroyed: (listener: () => void) => void,
  onRendererGone: (listener: () => void) => void,
  cleanup: () => boolean
): void {
  let handled = false;
  const onGone = (): void => {
    if (handled) return;
    handled = cleanup();
  };
  onDestroyed(onGone);
  onRendererGone(onGone);
}

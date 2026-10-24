export const VIEW_SCREEN_COLLAPSED_KEY = 'cth-view-screen-collapsed';

export function readViewScreenCollapsed(storage?: Pick<Storage, 'getItem'>): boolean {
  try { return (storage ?? window.localStorage).getItem(VIEW_SCREEN_COLLAPSED_KEY) === '1'; } catch { return false; }
}

export function writeViewScreenCollapsed(collapsed: boolean, storage?: Pick<Storage, 'setItem'>): void {
  try { (storage ?? window.localStorage).setItem(VIEW_SCREEN_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch { /* private mode */ }
}

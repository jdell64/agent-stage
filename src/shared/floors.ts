import { resolve } from 'node:path';

export interface FloorAgentPreview {
  id: string;
  name: string;
  character: string;
  status: string;
  isOrchestrator?: boolean;
}

export interface FloorSummary {
  floorNumber: number;
  webContentsId: number;
  home: string | null;
  folderName: string | null;
  /** Short 1-2 word tag for the Discord-style left rail tile (e.g. "CLIENT", "SIDE/APP"). */
  shortTag: string;
  /** Shortened path with `~` when under userHome (e.g. `~/work/client`). */
  displayPath: string | null;
  agentCount: number;
  workingCount: number;
  agents: FloorAgentPreview[];
}

export interface FloorsSnapshot {
  currentFloorNumber: number;
  floors: FloorSummary[];
  recentHives: string[];
}

/**
 * Normalize a hive directory path for cross-floor collision checks.
 * Uses platform resolution and lowercases on Windows so drive-letter casing
 * (`C:\dev\app` vs `c:\dev\app`) never allows two floors to open the same folder.
 */
export function normalizeHivePath(
  rawPath: string | null | undefined,
  platform: NodeJS.Platform = process.platform
): string | null {
  if (typeof rawPath !== 'string') return null;
  const trimmed = rawPath.trim();
  if (!trimmed) return null;
  const resolved = resolve(trimmed).replace(/[\\/]+$/, '');
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Check if pathA is nested within pathB or vice versa (or identical).
 */
export function arePathsNestedOrEqual(
  pathA: string | null | undefined,
  pathB: string | null | undefined,
  platform: NodeJS.Platform = process.platform
): boolean {
  const normA = normalizeHivePath(pathA, platform);
  const normB = normalizeHivePath(pathB, platform);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  const sepChar = platform === 'win32' ? '\\' : '/';
  const a = normA.endsWith(sepChar) ? normA : normA + sepChar;
  const b = normB.endsWith(sepChar) ? normB : normB + sepChar;
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Enforce "A single hive is only ever open in one floor", including nested folder collisions.
 * Returns the existing FloorSummary that already has `candidateHome` open (or nested), or null.
 */
export function findFloorByHome(
  floors: readonly FloorSummary[],
  candidateHome: string | null | undefined,
  excludeWebContentsId?: number,
  platform: NodeJS.Platform = process.platform
): FloorSummary | null {
  const target = normalizeHivePath(candidateHome, platform);
  if (!target) return null;
  for (const floor of floors) {
    if (excludeWebContentsId !== undefined && floor.webContentsId === excludeWebContentsId) {
      continue;
    }
    if (arePathsNestedOrEqual(floor.home, target, platform)) return floor;
  }
  return null;
}

/**
 * Assign the lowest positive integer floor number (1, 2, 3, ...) not currently in use.
 */
export function nextFloorNumber(existingNumbers: Iterable<number>): number {
  const used = new Set<number>();
  for (const n of existingNumbers) {
    if (Number.isInteger(n) && n > 0) used.add(n);
  }
  let candidate = 1;
  while (used.has(candidate)) candidate++;
  return candidate;
}

/**
 * Extract the readable folder basename from any POSIX or Windows path.
 */
export function extractFolderName(rawPath: string | null | undefined): string | null {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return null;
  const parts = rawPath.trim().replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? rawPath.trim();
}

/**
 * Derive a compact uppercase label (max ~9 chars) for the Discord-style F1/F2 rail tile.
 * Examples:
 * - `/Users/alex/work/client-app` -> `CLIENT`
 * - `/Users/alex/side/app` -> `SIDE/APP`
 * - `E:\LocalAgentStage` -> `AGENTSTG` / `LOCAL`
 */
export function deriveFloorShortTag(rawPath: string | null | undefined, floorNumber = 1): string {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return `FLOOR ${floorNumber}`;
  const parts = rawPath.trim().replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) return `FLOOR ${floorNumber}`;
  const last = parts[parts.length - 1];
  const parent = parts.length >= 2 ? parts[parts.length - 2] : '';

  // If the folder is named "hive" (common when harnessHome points at <workspace>/hive),
  // prefer the parent folder name if informative.
  const primary = last.toLowerCase() === 'hive' && parent ? parent : last;

  if (primary.length <= 4 && parent && !/^[a-zA-Z]:$/.test(parent) && parent.toLowerCase() !== 'users') {
    const combined = `${parent}/${primary}`.toUpperCase();
    if (combined.length <= 9) return combined;
  }

  const token = primary.split(/[-_.\s]+/).filter(Boolean)[0] ?? primary;
  return token.slice(0, 8).toUpperCase();
}

/**
 * Format a path with `~` when inside the user's home directory, using forward slashes
 * for clean display in the titlebar breadcrumb and Building Tower cards.
 */
export function shortenHomePath(
  rawPath: string | null | undefined,
  userHome?: string | null
): string | null {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return null;
  const cleanRaw = rawPath.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (userHome && userHome.trim()) {
    const cleanHome = userHome.trim().replace(/\\/g, '/').replace(/\/+$/, '');
    if (cleanHome) {
      const matchWin = cleanRaw.toLowerCase().startsWith(cleanHome.toLowerCase());
      if (matchWin && (cleanRaw.length === cleanHome.length || cleanRaw[cleanHome.length] === '/')) {
        const rest = cleanRaw.slice(cleanHome.length);
        return rest ? `~${rest}` : '~';
      }
    }
  }
  return cleanRaw;
}

/**
 * Format the OS window title for a floor.
 * When more than one floor is open, offices are numbered ("Agent Stage — Floor 2 · side-app").
 */
export function formatFloorWindowTitle(
  floorNumber: number,
  totalFloors: number,
  home: string | null | undefined
): string {
  const folder = extractFolderName(home);
  if (totalFloors <= 1 && floorNumber === 1) {
    return folder ? `Agent Stage — ${folder}` : 'Agent Stage';
  }
  if (!folder) {
    return `Agent Stage — Floor ${floorNumber}`;
  }
  return `Agent Stage — Floor ${floorNumber} · ${folder}`;
}

/**
 * Count how many agents in a preview list are actively working/thinking/typing/compacting.
 */
export function countWorkingAgents(agents: readonly { status?: string }[]): number {
  let n = 0;
  for (const a of agents) {
    const s = a.status ?? 'idle';
    if (s === 'working' || s === 'thinking' || s === 'typing' || s === 'compacting') {
      n++;
    }
  }
  return n;
}

/**
 * NOTE: this module is imported by the sandboxed renderer as well as main, so it
 * must stay free of Node built-ins (`node:path`, bare `process`).
 */
const hostPlatform = (): NodeJS.Platform => {
  if (typeof process !== 'undefined' && process.platform) return process.platform;
  if (typeof navigator !== 'undefined' && /win/i.test(navigator.platform || '')) return 'win32';
  return 'linux';
};

/** Pure, dependency-free stand-in for path.resolve on an already-absolute path. */
function normalizeSegments(p: string, win: boolean): string {
  const BS = String.fromCharCode(92);
  const sep = win ? BS : '/';
  const unified = win ? p.split('/').join(BS) : p;
  let prefix = '';
  let rest = unified;
  if (win) {
    const drive = /^[a-zA-Z]:/.exec(unified);
    if (drive) {
      prefix = drive[0];
    } else if (unified.startsWith(BS + BS)) {
      // UNC: keep \\server\share as the prefix.
      const parts = unified.slice(2).split(BS);
      prefix = BS + BS + parts.slice(0, 2).join(BS);
    }
    rest = unified.slice(prefix.length);
  }
  const rooted = rest.startsWith(sep) || prefix.startsWith(BS + BS);
  const out: string[] = [];
  for (const seg of rest.split(sep)) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (out.length) out.pop(); continue; }
    out.push(seg);
  }
  return prefix + (rooted ? sep : '') + out.join(sep);
}

export interface FloorAgentPreview {
  id: string;
  name: string;
  character: string;
  status: string;
  isOrchestrator?: boolean;
  /** What the agent is doing right now (its card caption), when it has one. */
  action?: string;
}

/** Starting squad for a freshly created floor (New Floor flow). */
export type FloorSquadPreset = 'standard' | 'minimal' | 'empty';

export interface FloorSquadMember {
  /** Short role label shown under the sprite. */
  label: string;
  name: string;
  character: string;
  /** One-line brief handed to the hive as the agent's role. */
  role: string;
  /** The orchestrator is always spawned by the floor itself; it is listed for display only. */
  orchestrator?: boolean;
}

export interface FloorSquadDefinition {
  id: FloorSquadPreset;
  title: string;
  blurb: string;
  tagline: string;
  members: FloorSquadMember[];
}

/**
 * The three starting squads offered by New Floor. Every floor boots its own
 * orchestrator (the hive cannot run without one), so `members[0]` is always the
 * orchestrator and `empty` means "orchestrator only, hire on demand".
 */
export const FLOOR_SQUADS: readonly FloorSquadDefinition[] = [
  {
    id: 'standard',
    title: 'Standard Squad',
    blurb: '5 agents (Lead, Architect, Frontend, DevOps, Reviewer)',
    tagline: 'FULL TEAM',
    members: [
      { label: 'LEAD', name: 'Lead', character: 'ivo', role: 'Orchestrator — runs the floor', orchestrator: true },
      { label: 'ARCH', name: 'Architect', character: 'ada', role: 'Architect — designs the approach, owns structure and interfaces' },
      { label: 'FRONTEND', name: 'Frontend', character: 'dax', role: 'Frontend engineer — UI, components and UX polish' },
      { label: 'DEVOPS', name: 'DevOps', character: 'gus', role: 'DevOps engineer — build, CI, infrastructure and release plumbing' },
      { label: 'REVIEW', name: 'Reviewer', character: 'otto', role: 'Reviewer — reads every diff, runs the tests, gates merges' }
    ]
  },
  {
    id: 'minimal',
    title: 'Minimal Duo',
    blurb: '2 agents (Lead builds, Tester verifies)',
    tagline: 'FAST & LEAN',
    members: [
      { label: 'LEAD', name: 'Lead', character: 'ivo', role: 'Orchestrator — runs the floor and builds', orchestrator: true },
      { label: 'TEST', name: 'Tester', character: 'eli', role: 'Tester — writes and runs tests, verifies every change' }
    ]
  },
  {
    id: 'empty',
    title: 'Standby Floor',
    blurb: 'Orchestrator only, hire agents on demand',
    tagline: 'IDLE',
    members: [
      { label: 'LEAD', name: 'Lead', character: 'ivo', role: 'Orchestrator — runs the floor', orchestrator: true }
    ]
  }
];

export function isFloorSquadPreset(v: unknown): v is FloorSquadPreset {
  return v === 'standard' || v === 'minimal' || v === 'empty';
}

export function squadDefinition(preset: FloorSquadPreset | null | undefined): FloorSquadDefinition {
  return FLOOR_SQUADS.find((s) => s.id === preset) ?? FLOOR_SQUADS[2];
}

/** The worker agents a preset hires on top of the orchestrator. */
export function squadWorkers(preset: FloorSquadPreset | null | undefined): FloorSquadMember[] {
  return squadDefinition(preset).members.filter((m) => !m.orchestrator);
}

export const FLOOR_NAME_MAX = 32;

/**
 * Clean a user-typed floor name/alias: collapse whitespace, strip control chars,
 * cap the length. Returns null for blank input (callers then fall back to the folder name).
 */
export function sanitizeFloorName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = Array.from(raw, (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, FLOOR_NAME_MAX).trim() || null;
}

/** The label a floor goes by: its alias, else its folder name, else "Floor N". */
export function floorDisplayName(
  name: string | null | undefined,
  home: string | null | undefined,
  floorNumber: number
): string {
  return sanitizeFloorName(name) ?? projectFolderName(home) ?? `Floor ${floorNumber}`;
}

/** Folder name for display; a hive folder literally called `hive` reads as its parent project. */
export function projectFolderName(rawPath: string | null | undefined): string | null {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return null;
  const parts = rawPath.trim().replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1];
  const parent = parts.length >= 2 ? parts[parts.length - 2] : '';
  return last.toLowerCase() === 'hive' && parent && !/^[a-zA-Z]:$/.test(parent) ? parent : last;
}

/** Status of a candidate folder as shown in New Floor's recent-repositories list. */
export interface FloorFolderStatus {
  path: string;
  exists: boolean;
  /** 'git' repo, plain 'folder', or a path that does not exist yet ('new'). */
  kind: 'git' | 'folder' | 'new';
  branch?: string | null;
  dirty?: boolean;
  /** Floor that already owns (or contains) this folder, when it is locked. */
  lockedByFloor?: number | null;
  lockedByName?: string | null;
}

export interface NewFloorInfo {
  nextFloorNumber: number;
  recents: FloorFolderStatus[];
}

export interface OpenFloorOptions {
  home?: string | null;
  name?: string | null;
  squad?: FloorSquadPreset | null;
}

export interface FloorSummary {
  floorNumber: number;
  webContentsId: number;
  home: string | null;
  folderName: string | null;
  /** The floor's alias (as typed at create / rename), or null when it goes by folder name. */
  name?: string | null;
  /** Alias, else folder name, else "Floor N" — what the UI shows as the floor title. */
  displayName?: string;
  /** Headline of what the floor is doing right now (first working agent's action). */
  activity?: string | null;
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
  platform: NodeJS.Platform = hostPlatform()
): string | null {
  if (typeof rawPath !== 'string') return null;
  const trimmed = rawPath.trim();
  if (!trimmed) return null;
  const resolved = normalizeSegments(trimmed, platform === 'win32').replace(/[\\/]+$/, '');
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Check if pathA is nested within pathB or vice versa (or identical).
 */
export function arePathsNestedOrEqual(
  pathA: string | null | undefined,
  pathB: string | null | undefined,
  platform: NodeJS.Platform = hostPlatform()
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
  platform: NodeJS.Platform = hostPlatform()
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
  home: string | null | undefined,
  alias?: string | null
): string {
  const folder = sanitizeFloorName(alias) ?? extractFolderName(home);
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

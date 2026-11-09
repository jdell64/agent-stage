/**
 * BuildingMemory — the cross-floor shared memory layer.
 *
 * Floors stay isolated for WORK: each has its own hive folder, roster, hook pipe,
 * inbox/outbox and per-floor MemPalace. What they did not have was any way to
 * share what they learned. This is that layer, building-wide and deliberately
 * small:
 *
 *   <userData>/building/
 *     palace/                          one MemPalace, owned by exactly ONE writer
 *     hive/agents/<wing>/memory.md     one append-only notes file PER FLOOR
 *
 * - WRITE: an agent appends to its own floor's file (`CTH_BUILDING_MEMORY_FILE`).
 *   One file per floor means two floors never write the same file, so there is
 *   no cross-floor write contention and no lock to hold.
 * - READ: every agent can read any floor's file straight off disk
 *   (`CTH_BUILDING_MEMORY_DIR`). The shared palace is maintained by the app and
 *   is deliberately not writable from agent sandboxes.
 * - INDEX: a single MemoryManager rooted at the building dir mines every floor's
 *   file into its own wing. MemPalace permits one writer, so this process-wide
 *   instance is the only thing that ever mines the building palace; floors only
 *   write markdown.
 *
 * It reuses MemoryManager rather than re-implementing the mine loop: pointing it
 * at `<building>` makes `palacePath()` = `<building>/palace` and `mineNow()` walk
 * `<building>/hive/agents/*`, which is exactly the layout above.
 *
 * The plain-file layer works with no `mempalace` installed (and with semantic
 * memory switched off), so cross-floor sharing never depends on the optional CLI.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryManager, type MemorySettings } from './memory';
import { extractFolderName, normalizeHivePath } from '../shared/floors';

export interface BuildingMemoryHandle {
  /** Stable wing name for this floor (its folder + a short hash of the path). */
  wing: string;
  /** The floor's own append-only notes file. */
  file: string;
  /** Root holding every floor's notes (read any of them). */
  dir: string;
  /** Building palace path, or null when semantic memory is not active. */
  palace: string | null;
}

/**
 * Stable per-floor wing. Keyed on the floor's FOLDER (one-folder-per-floor is
 * enforced), not its number or alias: floor numbers are recycled when a floor
 * closes and aliases are renamed, and neither should splice two floors' notes
 * together or orphan a floor's history.
 */
export function buildingWingFor(home: string): string {
  const norm = normalizeHivePath(home) ?? home;
  const hash = createHash('sha1').update(norm).digest('hex').slice(0, 6);
  const base = (extractFolderName(home) ?? 'floor')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `${base || 'floor'}-${hash}`;
}

export class BuildingMemory {
  private readonly mem: MemoryManager;

  constructor(
    private readonly dir: () => string,
    getSettings: () => MemorySettings
  ) {
    this.mem = new MemoryManager(() => this.dir(), getSettings);
  }

  root(): string { return this.dir(); }

  agentsDir(): string { return join(this.dir(), 'hive', 'agents'); }

  /** Create (idempotently) a floor's notes file and return its handle. */
  ensureWing(home: string, label: string): BuildingMemoryHandle {
    const wing = buildingWingFor(home);
    const wingDir = join(this.agentsDir(), wing);
    const file = join(wingDir, 'memory.md');
    try {
      mkdirSync(wingDir, { recursive: true });
      if (!existsSync(file)) {
        writeFileSync(
          file,
          `# Building memory — ${label}\n\nShared notes from the "${label}" floor (${home}). ` +
            'Every floor can read this; only this floor writes it. Append durable, cross-floor-relevant facts below.\n',
          'utf8'
        );
      }
      this.writeReadme();
    } catch (e) {
      console.error('[building-memory] could not provision wing', wing, e);
    }
    return { wing, file, dir: this.agentsDir(), palace: this.mem.active() ? join(this.dir(), 'palace') : null };
  }

  /** Env that makes the building layer discoverable from an agent's shell. */
  env(handle: BuildingMemoryHandle): Record<string, string> {
    return {
      CTH_BUILDING_MEMORY_DIR: handle.dir,
      CTH_BUILDING_MEMORY_FILE: handle.file,
      ...(handle.palace ? { CTH_BUILDING_PALACE_PATH: handle.palace } : {})
    };
  }

  /**
   * The paragraph baked into every agent's protocol prompt. Absolute paths, no
   * `$VAR`, and nothing volatile — the same prompt-cache rules as the rest of the
   * injected prefix (see HiveManager.injectedPrompt).
   */
  promptLine(handle: BuildingMemoryHandle): string {
    return (
      `Building memory (shared across ALL floors): this is one floor of a multi-floor building and floors are isolated for work, but they share a memory layer. ` +
      `To leave a note other floors' agents should be able to find, append it to ${handle.file} (your floor's own file; never edit another floor's). ` +
      `To read what other floors recorded, read the files under ${handle.dir}. The app maintains the shared semantic index; do not run MemPalace CLI commands against it. ` +
      `Keep it to durable, cross-floor-relevant facts (conventions, decisions, gotchas, who owns what) — not task chatter, and never secrets.`
    );
  }

  /** Directories an agent's OS sandbox may write for this layer. */
  writableDirs(handle: BuildingMemoryHandle): string[] {
    // Agents append their own wing's markdown. Only this process mines/indexes
    // the building palace; exposing it as allowWrite would allow concurrent CLI
    // searches or maintenance to race the app's single writer.
    return [join(handle.dir, handle.wing)];
  }

  start(): void { this.mem.start(); }
  stop(): void { this.mem.stop(); }
  refresh(): void { this.mem.refresh(); }
  active(): boolean { return this.mem.active(); }

  /** Test seam / manual re-index. */
  mineNow(): Promise<void> { return this.mem.mineNow(); }

  private writeReadme(): void {
    const readme = join(this.dir(), 'README.md');
    try {
      if (existsSync(readme)) {
        if (readFileSync(readme, 'utf8').includes('Building memory')) return;
      }
      writeFileSync(
        readme,
        '# Building memory\n\nCross-floor shared memory for Agent Stage.\n\n' +
          '- `hive/agents/<floor>/memory.md` — one append-only notes file per floor (only that floor writes it).\n' +
          '- `palace/` — a MemPalace indexing every floor file, one wing per floor (the app is its only writer).\n',
        'utf8'
      );
    } catch { /* best-effort */ }
  }
}

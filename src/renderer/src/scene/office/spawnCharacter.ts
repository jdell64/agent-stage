/** Picks the cast member for an agent that main spawned (voice hire, orchestrator
 *  worker request) and the renderer has to card on its own.
 *
 *  The pick is made against the ACTIVE theme's cast, because the portrait and the
 *  floor sprite both resolve by name in that cast: a name the theme does not have
 *  draws the built-in procedural portrait and the scene falls back to the theme's
 *  default character (Michael, in the Office theme). So an explicit character or
 *  a matching name wins, otherwise the first member nobody on the floor is using,
 *  and only when the whole cast is taken a stable hash of the id. */
export interface SpawnCastMember { name: string; displayName: string }

/** Keep a persisted theme character through the restart respawn path.
 *
 * The built-in `normalizeCharacter` helper only understands the procedural
 * cast. Applying it here replaced valid theme entries such as TNG's `picard`
 * with the built-in fallback before the active theme could resolve the portrait.
 */
export function restorePersistedCharacter(saved: string | undefined, fallback: string): string {
  return saved?.trim() || fallback;
}

/** Resolve a saved agent character against the active theme, matching the
 * portrait's theme-cast lookup and the floor's default when it is unavailable. */
export function resolveFloorCharacter(character: string, cast: {
  byName: Record<string, unknown>;
  defaultCharacter: string;
}): string {
  return cast.byName[character] ? character : cast.defaultCharacter;
}

export function pickSpawnCharacter(opts: {
  explicit?: string;
  name?: string;
  id: string;
  roster: readonly SpawnCastMember[];
  used: readonly string[];
  fallback: string;
}): string {
  const { roster, used, id, fallback } = opts;
  if (roster.length === 0) return fallback;
  const find = (q?: string) => {
    const k = q?.trim().toLowerCase();
    return k ? roster.find((m) => m.name === k || m.displayName.toLowerCase() === k)?.name : undefined;
  };
  const named = find(opts.explicit) ?? find(opts.name || id);
  if (named) return named;
  const taken = new Set(used);
  const free = roster.find((m) => !taken.has(m.name));
  if (free) return free.name;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return roster[h % roster.length].name;
}

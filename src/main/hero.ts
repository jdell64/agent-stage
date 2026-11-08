import { DEFAULT_HERO, type HeroPayload } from '../shared/heroPayload';

/**
 * Local-only hero payload resolver.
 * Remote fetching from munderdiffl.in/hero.json is disabled for enterprise safety.
 */
export async function loadHero(
  _cachePath?: string,
  _opts: { force?: boolean } = {}
): Promise<{ hero: HeroPayload; fetchedAt: number; stale: boolean }> {
  return { hero: DEFAULT_HERO, fetchedAt: Date.now(), stale: false };
}

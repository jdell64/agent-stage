/** Metadata normalization shared by built-in and disk-backed theme casts. */
const RANK_PREFIX = /^(?:captain|commander|lieutenant|ensign|chief|doctor|dr\.?|nurse|agent)\s+/i;

export function normalizeCastDisplayName(raw: unknown, characterName?: unknown): string {
  const source = typeof raw === 'string' && raw.trim() ? raw.trim() : String(characterName ?? '').trim();
  if (/^(?:nurse\s+)?ogawa$/i.test(source) || String(characterName ?? '').trim().toLowerCase() === 'ogawa') return 'Keiko';
  return source.replace(RANK_PREFIX, '').trim() || 'Unknown';
}

export function normalizePronouns(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  return value.length >= 1 && value.length <= 24 ? value : undefined;
}

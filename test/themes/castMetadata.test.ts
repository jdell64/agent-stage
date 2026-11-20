import { describe, expect, it } from 'vitest';
import { normalizeCastDisplayName, normalizePronouns } from '../../src/shared/castMetadata';

describe('cast metadata', () => {
  it('removes rank titles from display names', () => {
    expect(normalizeCastDisplayName('Captain Jellico', 'jellico')).toBe('Jellico');
    expect(normalizeCastDisplayName('Commander Riker', 'riker')).toBe('Riker');
  });
  it('renames Nurse Ogawa to Keiko', () => {
    expect(normalizeCastDisplayName('Nurse Ogawa', 'ogawa')).toBe('Keiko');
    expect(normalizeCastDisplayName(undefined, 'ogawa')).toBe('Keiko');
  });
  it('accepts compact pronoun labels only', () => {
    expect(normalizePronouns(' she/her ')).toBe('she/her');
    expect(normalizePronouns('')).toBeUndefined();
    expect(normalizePronouns('x'.repeat(25))).toBeUndefined();
  });
});

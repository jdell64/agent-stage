import { describe, expect, it } from 'vitest';
import { readViewScreenCollapsed, writeViewScreenCollapsed, VIEW_SCREEN_COLLAPSED_KEY } from '../../src/renderer/src/components/viewScreenPreference';

describe('view screen preference', () => {
  it('remembers whether the user collapsed the floor view', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(readViewScreenCollapsed(storage)).toBe(false);
    writeViewScreenCollapsed(true, storage);
    expect(values.get(VIEW_SCREEN_COLLAPSED_KEY)).toBe('1');
    expect(readViewScreenCollapsed(storage)).toBe(true);
    writeViewScreenCollapsed(false, storage);
    expect(readViewScreenCollapsed(storage)).toBe(false);
  });

  it('falls back safely when browser storage is unavailable', () => {
    const broken = { getItem: () => { throw new Error('unavailable'); }, setItem: () => { throw new Error('unavailable'); } };
    expect(readViewScreenCollapsed(broken)).toBe(false);
    expect(() => writeViewScreenCollapsed(true, broken)).not.toThrow();
  });
});

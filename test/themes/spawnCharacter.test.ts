import { describe, it, expect } from 'vitest';
import { pickSpawnCharacter } from '../../src/renderer/src/scene/office/spawnCharacter';

const office = ['michael', 'jim', 'pam', 'dwight', 'ryan'].map((n) => ({ name: n, displayName: n[0].toUpperCase() + n.slice(1) }));

describe('pickSpawnCharacter', () => {
  it('uses the explicit character when the active theme has it', () => {
    expect(pickSpawnCharacter({ explicit: 'pam', name: 'x', id: 'w1', roster: office, used: [], fallback: 'ben' })).toBe('pam');
  });
  it('matches the agent name against the theme cast (case-insensitive)', () => {
    expect(pickSpawnCharacter({ name: 'Ryan', id: 'worker-t38-ids', roster: office, used: ['michael'], fallback: 'ben' })).toBe('ryan');
  });
  it('an unnamed spawn takes a free theme member, never a built-in name or the default sprite', () => {
    const c = pickSpawnCharacter({ name: 'Builder', id: 'w2', roster: office, used: ['michael', 'jim'], fallback: 'ben' });
    expect(c).toBe('pam');
    expect(office.map((m) => m.name)).toContain(c);
  });
  it('ignores an explicit character the theme does not have', () => {
    expect(pickSpawnCharacter({ explicit: 'ben', name: 'Zed', id: 'w3', roster: office, used: ['michael'], fallback: 'ben' })).toBe('jim');
  });
  it('falls back to a stable id hash when the whole cast is in use', () => {
    const used = office.map((m) => m.name);
    const a = pickSpawnCharacter({ name: 'Q', id: 'same-id', roster: office, used, fallback: 'ben' });
    expect(a).toBe(pickSpawnCharacter({ name: 'Q', id: 'same-id', roster: office, used, fallback: 'ben' }));
    expect(used).toContain(a);
  });
  it('uses the fallback only when there is no roster at all', () => {
    expect(pickSpawnCharacter({ id: 'w', roster: [], used: [], fallback: 'ben' })).toBe('ben');
  });
});

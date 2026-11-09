import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  sanitizeFloorName,
  floorDisplayName,
  projectFolderName,
  formatFloorWindowTitle,
  isFloorSquadPreset,
  squadDefinition,
  squadWorkers,
  FLOOR_SQUADS,
  FLOOR_NAME_MAX
} from '../../src/shared/floors';

const NUL = String.fromCharCode(0);
const BS = String.fromCharCode(92);
const win = (...parts: string[]) => parts.join(BS);

describe('floor names', () => {
  it('sanitizeFloorName trims, collapses whitespace, strips control chars and caps length', () => {
    expect(sanitizeFloorName('  billing   portal ')).toBe('billing portal');
    expect(sanitizeFloorName(`a${NUL}b\tc`)).toBe('a b c');
    expect(sanitizeFloorName('x'.repeat(100))?.length).toBe(FLOOR_NAME_MAX);
    expect(sanitizeFloorName('   ')).toBeNull();
    expect(sanitizeFloorName(42)).toBeNull();
    expect(sanitizeFloorName(null)).toBeNull();
  });

  it('floorDisplayName prefers the alias, then the folder, then "Floor N"', () => {
    expect(floorDisplayName('Billing', win('C:', 'work', 'client'), 2)).toBe('Billing');
    expect(floorDisplayName(null, win('C:', 'work', 'client'), 2)).toBe('client');
    expect(floorDisplayName('  ', null, 3)).toBe('Floor 3');
  });

  it('a hive folder literally named "hive" reads as its parent project', () => {
    expect(projectFolderName(win('C:', 'work', 'client', 'hive'))).toBe('client');
    expect(projectFolderName('/work/client/hive/')).toBe('client');
    expect(projectFolderName('/work/client')).toBe('client');
    expect(projectFolderName('')).toBeNull();
  });

  it('window title uses the alias when the floor has one', () => {
    const home = win('C:', 'work', 'my-app');
    expect(formatFloorWindowTitle(2, 3, home, 'Billing')).toBe('Agent Stage — Floor 2 · Billing');
    expect(formatFloorWindowTitle(1, 1, home, 'Billing')).toBe('Agent Stage — Billing');
    expect(formatFloorWindowTitle(2, 3, home)).toBe('Agent Stage — Floor 2 · my-app');
  });
});

describe('starting squads', () => {
  it('offers standard / minimal / empty, each led by exactly one orchestrator', () => {
    expect(FLOOR_SQUADS.map((s) => s.id)).toEqual(['standard', 'minimal', 'empty']);
    for (const s of FLOOR_SQUADS) {
      expect(s.members[0].orchestrator).toBe(true);
      expect(s.members.filter((m) => m.orchestrator)).toHaveLength(1);
    }
  });

  it('hires workers on top of the orchestrator (standard 4, minimal 1, empty 0)', () => {
    expect(squadWorkers('standard')).toHaveLength(4);
    expect(squadWorkers('minimal')).toHaveLength(1);
    expect(squadWorkers('empty')).toHaveLength(0);
    expect(squadDefinition('standard').members).toHaveLength(5);
    expect(squadDefinition('minimal').members).toHaveLength(2);
  });

  it('rejects unknown presets and degrades them to the empty squad', () => {
    expect(isFloorSquadPreset('standard')).toBe(true);
    expect(isFloorSquadPreset('huge')).toBe(false);
    expect(isFloorSquadPreset(undefined)).toBe(false);
    expect(squadWorkers(null)).toHaveLength(0);
  });
});

/**
 * Phantom-floor regression (v0.6.0). The rail and the tower used to render every
 * `recentHives` entry that was not open as a dimmed "F<N>" tile / "open recent folder"
 * row, so a one-floor building showed floors that did not exist. Recents belong to the
 * New Floor flow only; neither floor surface may read them again.
 */
describe('phantom floor regression', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, '../../src/renderer/src/components', rel), 'utf8');

  it('FloorRail and FloorsModal never render recentHives', () => {
    for (const f of ['FloorRail.tsx', 'FloorsModal.tsx']) {
      expect(read(f), f).not.toMatch(/recentHives|unopenedRecents/);
    }
  });

  it('New Floor is where recent folders live', () => {
    expect(read('NewFloorModal.tsx')).toMatch(/recents/);
  });
});

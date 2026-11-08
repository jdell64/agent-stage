import { describe, expect, it } from 'vitest';
import { THEMES, type ThemeConfig } from '../../src/renderer/src/scene/office/themeRegistry';
import { invalidateThemeCache } from '../../src/renderer/src/scene/office/themeLoader';
import {
  SEAT_BACK_CROP,
  SEAT_LEG_CROP,
  SEAT_SIDE_CROP,
  seatedCropForDirection,
} from '../../src/renderer/src/scene/office/Character';

describe('seatedCropForDirection', () => {
  it('crops standing legs on down- and side-facing seats while preserving back torso on up-facing seats', () => {
    expect(seatedCropForDirection('down')).toBe(SEAT_LEG_CROP);
    expect(seatedCropForDirection('left')).toBe(SEAT_SIDE_CROP);
    expect(seatedCropForDirection('right')).toBe(SEAT_SIDE_CROP);
    expect(seatedCropForDirection('up')).toBe(SEAT_BACK_CROP);
    expect(SEAT_LEG_CROP).toBeGreaterThanOrEqual(7);
    expect(SEAT_SIDE_CROP).toBeGreaterThanOrEqual(7);
  });
});

describe('invalidateThemeCache', () => {
  it('evicts a specific theme or clears the entire runtime theme registry', () => {
    const fakeTheme = (id: string): ThemeConfig => ({
      id,
      mapRaw: '{}',
      tilesets: [],
      primarySeatNames: [],
      cafeSeatNames: [],
      cafeStands: [],
      coffee: {
        trayTile: { x: 0, y: 0 },
        trayStand: { x: 0, y: 0 },
        machineStand: { x: 0, y: 0 },
        sinkTile: { x: 0, y: 0 },
        sinkStand: { x: 0, y: 0 },
        maxCups: 0,
      },
      anchors: { calendar: { x: 0, y: 0 }, boards: { x: 0, y: 0 }, clock: { x: 0, y: 0 } },
      errandSpots: [],
      monitor: { offTopLeftGid: 0, onGids: [] },
      palette: { background: 0, noteColors: {} },
      cast: { byName: {}, getFrames: async () => [], defaultCharacter: 'ada' },
    });

    THEMES.set('tng', fakeTheme('tng'));
    THEMES.set('plain', fakeTheme('plain'));

    invalidateThemeCache('tng');
    expect(THEMES.has('tng')).toBe(false);
    expect(THEMES.has('plain')).toBe(true);

    invalidateThemeCache();
    expect(THEMES.size).toBe(0);
  });
});

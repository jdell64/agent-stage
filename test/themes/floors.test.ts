import { describe, it, expect } from 'vitest';
import {
  normalizeHivePath,
  findFloorByHome,
  nextFloorNumber,
  deriveFloorShortTag,
  shortenHomePath,
  formatFloorWindowTitle,
  countWorkingAgents,
  type FloorSummary
} from '../../src/shared/floors';

describe('src/shared/floors', () => {
  describe('normalizeHivePath', () => {
    it('normalizes null, undefined and empty strings to null', () => {
      expect(normalizeHivePath(null)).toBeNull();
      expect(normalizeHivePath(undefined)).toBeNull();
      expect(normalizeHivePath('')).toBeNull();
      expect(normalizeHivePath('   ')).toBeNull();
    });

    it('lowercases and strips trailing slashes on win32', () => {
      const p1 = normalizeHivePath('C:\\Dev\\Project\\', 'win32');
      const p2 = normalizeHivePath('c:\\dev\\project', 'win32');
      expect(p1).toBe(p2);
      expect(p1?.endsWith('\\')).toBe(false);
    });
  });

  describe('findFloorByHome', () => {
    const existingFloors: FloorSummary[] = [
      {
        floorNumber: 1,
        webContentsId: 101,
        home: 'C:\\work\\client-app',
        folderName: 'client-app',
        shortTag: 'CLIENT',
        displayPath: '~/work/client-app',
        agentCount: 3,
        workingCount: 2,
        agents: []
      },
      {
        floorNumber: 2,
        webContentsId: 102,
        home: 'C:\\work\\side-project',
        folderName: 'side-project',
        shortTag: 'SIDE',
        displayPath: '~/work/side-project',
        agentCount: 1,
        workingCount: 0,
        agents: []
      }
    ];

    it('finds floor matching path case-insensitively on Windows', () => {
      const found = findFloorByHome(existingFloors, 'c:\\WORK\\client-app\\', undefined, 'win32');
      expect(found).not.toBeNull();
      expect(found?.floorNumber).toBe(1);
    });

    it('returns null when candidate is not open in any floor', () => {
      const found = findFloorByHome(existingFloors, 'C:\\work\\other-project', undefined, 'win32');
      expect(found).toBeNull();
    });
  });

  describe('nextFloorNumber', () => {
    it('allocates the lowest available positive integer', () => {
      expect(nextFloorNumber([])).toBe(1);
      expect(nextFloorNumber([1])).toBe(2);
      expect(nextFloorNumber([1, 2])).toBe(3);
      // Holes are filled
      expect(nextFloorNumber([1, 3])).toBe(2);
      expect(nextFloorNumber([2, 3])).toBe(1);
    });
  });

  describe('deriveFloorShortTag', () => {
    it('generates uppercase slug for folder names', () => {
      expect(deriveFloorShortTag('C:\\work\\client-app')).toBe('CLIENT');
      expect(deriveFloorShortTag('C:\\side\\app')).toBe('SIDE/APP');
      expect(deriveFloorShortTag(null, 3)).toBe('FLOOR 3');
    });
  });

  describe('shortenHomePath', () => {
    it('replaces userHome prefix with ~', () => {
      const shortened = shortenHomePath('/Users/troi/code/hive', '/Users/troi');
      expect(shortened).toBe('~/code/hive');
    });

    it('returns null for null or empty path', () => {
      expect(shortenHomePath(null)).toBeNull();
      expect(shortenHomePath('')).toBeNull();
    });
  });

  describe('formatFloorWindowTitle', () => {
    it('formats single floor vs multiple floors', () => {
      expect(formatFloorWindowTitle(1, 1, 'C:\\work\\my-app')).toBe('Agent Stage — my-app');
      expect(formatFloorWindowTitle(2, 3, 'C:\\work\\my-app')).toBe('Agent Stage — Floor 2 · my-app');
      expect(formatFloorWindowTitle(2, 3, null)).toBe('Agent Stage — Floor 2');
    });
  });

  describe('countWorkingAgents', () => {
    it('counts agents in working/running/busy states', () => {
      const agents = [
        { id: '1', name: 'A', character: 'c1', status: 'working' },
        { id: '2', name: 'B', character: 'c2', status: 'idle' },
        { id: '3', name: 'C', character: 'c3', status: 'thinking' },
        { id: '4', name: 'D', character: 'c4', status: 'compacting' },
        { id: '5', name: 'E', character: 'c5', status: 'offline' }
      ];
      expect(countWorkingAgents(agents)).toBe(3);
    });
  });
});

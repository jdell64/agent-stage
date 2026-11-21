import { describe, it, expect } from 'vitest';
import { IdleZoneAllocator } from '../../src/renderer/src/scene/office/IdleZoneAllocator';

describe('IdleZoneAllocator', () => {
  it('reserves distinct zones and releases them when agents leave', () => {
    const zones = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
    const allocator = new IdleZoneAllocator(zones);
    const canWalk = () => true;
    const a = allocator.reserveNext('a', { x: 0, y: 0 }, canWalk)!;
    const b = allocator.reserveNext('b', { x: 0, y: 0 }, canWalk)!;
    expect(a).not.toEqual(b);
    expect(allocator.reserveNext('c', { x: 0, y: 0 }, canWalk)).toBeUndefined();
    allocator.release('a');
    expect(allocator.reserveNext('c', { x: 0, y: 0 }, canWalk)).toEqual(a);
  });

  it('skips currently occupied or unwalkable zones', () => {
    const allocator = new IdleZoneAllocator([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
    expect(allocator.reserveNext('a', { x: 1, y: 1 }, (tile) => tile.x === 2)).toEqual({ x: 2, y: 2 });
    expect(allocator.reserveNext('b', { x: 0, y: 0 }, (tile) => tile.x === 1)).toEqual({ x: 1, y: 1 });
    expect(allocator.reserveNext('c', { x: 0, y: 0 }, () => true)).toBeUndefined();
  });
});

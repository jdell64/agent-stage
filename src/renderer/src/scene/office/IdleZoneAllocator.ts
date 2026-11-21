import type { Tile } from './themeRegistry';

/** Keeps one declared idle destination assigned to each wandering agent. */
export class IdleZoneAllocator {
  private readonly ownerByZone = new Map<string, string>();
  private readonly zoneByOwner = new Map<string, string>();

  constructor(private readonly zones: readonly Tile[]) {}

  reserveNext(agentId: string, current: Tile, canWalkTo: (tile: Tile) => boolean): Tile | undefined {
    const available = this.zones.filter((zone) =>
      (zone.x !== current.x || zone.y !== current.y)
      && !this.ownerByZone.has(this.key(zone))
      && canWalkTo(zone)
    );
    if (!available.length) {
      // The agent is about to use the random-walk fallback, so its previous
      // destination stops being occupied as it leaves.
      this.release(agentId);
      return undefined;
    }
    const zone = available[Math.floor(Math.random() * available.length)];
    this.release(agentId);
    const key = this.key(zone);
    this.ownerByZone.set(key, agentId);
    this.zoneByOwner.set(agentId, key);
    return zone;
  }

  release(agentId: string): void {
    const key = this.zoneByOwner.get(agentId);
    if (key !== undefined) this.ownerByZone.delete(key);
    this.zoneByOwner.delete(agentId);
  }

  private key(tile: Tile): string { return `${tile.x},${tile.y}`; }
}

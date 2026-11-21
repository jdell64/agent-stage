import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface HiveInstanceLock {
  path: string;
  release(): void;
}

function ownerAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Acquire an exclusive lock owned by the process using a hive root. */
export function acquireHiveInstanceLock(root: string): { ok: true; lock: HiveInstanceLock } | { ok: false; ownerPid?: number } {
  const path = join(root, '.agent-stage-instance.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx');
      writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      closeSync(fd);
      let released = false;
      return { ok: true, lock: { path, release: () => { if (released) return; released = true; try { unlinkSync(path); } catch { /* already gone */ } } } };
    } catch {
      let pid: number | undefined;
      try { pid = JSON.parse(readFileSync(path, 'utf8')).pid; } catch { /* malformed/stale */ }
      if (pid && ownerAlive(pid)) return { ok: false, ownerPid: pid };
      try { if (existsSync(path)) unlinkSync(path); } catch { return { ok: false, ownerPid: pid }; }
    }
  }
  return { ok: false };
}

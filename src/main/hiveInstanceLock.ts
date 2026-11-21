import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface HiveInstanceLock {
  path: string;
  nonce: string;
  release(): void;
}

const MALFORMED_LOCK_STALE_MS = 30_000;

function ownerAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Acquire an exclusive lock owned by the process using a hive root. */
export function acquireHiveInstanceLock(root: string): { ok: true; lock: HiveInstanceLock } | { ok: false; ownerPid?: number } {
  mkdirSync(root, { recursive: true });
  const path = join(root, '.agent-stage-instance.lock');
  for (let attempt = 0; attempt < 8; attempt++) {
    const nonce = randomUUID();
    try {
      const fd = openSync(path, 'wx');
      writeFileSync(fd, JSON.stringify({ pid: process.pid, nonce, startedAt: new Date().toISOString() }));
      closeSync(fd);
      let released = false;
      return { ok: true, lock: { path, nonce, release: () => {
        if (released) return;
        released = true;
        try {
          const current = JSON.parse(readFileSync(path, 'utf8'));
          if (current.pid === process.pid && current.nonce === nonce) unlinkSync(path);
        } catch { /* already gone or replaced */ }
      } } };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        let contents: string | undefined;
        let pid: number | undefined;
        let stale = false;
        try {
          contents = readFileSync(path, 'utf8');
          pid = JSON.parse(contents).pid;
        } catch { /* malformed/stale */ }
        if (pid && ownerAlive(pid)) return { ok: false, ownerPid: pid };
        try {
          const age = Date.now() - statSync(path).mtimeMs;
          stale = (pid !== undefined && !ownerAlive(pid)) || (pid === undefined && age > MALFORMED_LOCK_STALE_MS);
        } catch { /* it disappeared; retry */ }
        // Rename is an atomic claim on the stale pathname. A competing
        // contender cannot unlink the fresh lock another process just created.
        if (contents !== undefined && stale) {
          const stalePath = `${path}.${process.pid}.${nonce}.stale`;
          try {
            if (readFileSync(path, 'utf8') !== contents) continue;
            renameSync(path, stalePath);
            try { unlinkSync(stalePath); } catch { /* stale tombstone is harmless */ }
          } catch { /* another contender claimed/replaced it; retry */ }
        }
      } else {
        return { ok: false };
      }
    }
  }
  return { ok: false };
}

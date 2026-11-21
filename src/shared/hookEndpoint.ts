import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

/** Stable hook endpoint scoped to both this app's userData and this hive root.
 * The userData component prevents a sandbox/review build from reaching the
 * live instance; the root component keeps multiple floors in one app apart. */
export function hookEndpointForInstance(userDataPath: string, hiveRoot: string, platform = process.platform): string {
  const key = `${resolve(userDataPath)}\0${resolve(hiveRoot)}`;
  const id = createHash('sha256').update(key).digest('hex').slice(0, 20);
  if (platform === 'win32') return `\\\\.\\pipe\\agent-stage-hooks-${id}`;
  return join(resolve(userDataPath), `agent-stage-hooks-${id}.sock`);
}

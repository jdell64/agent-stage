const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { acquireHiveInstanceLock } = loadTs('src/main/hiveInstanceLock.ts');

test('only one process can own a hive-root lock and release permits takeover', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-stage-lock-'));
  const first = acquireHiveInstanceLock(root);
  assert.equal(first.ok, true);
  const second = acquireHiveInstanceLock(root);
  assert.equal(second.ok, false);
  if (first.ok) first.lock.release();
  const third = acquireHiveInstanceLock(root);
  assert.equal(third.ok, true);
  if (third.ok) third.lock.release();
  fs.rmSync(root, { recursive: true, force: true });
});

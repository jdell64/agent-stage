const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const loadTs = require('./load-ts.cjs');
const { acquireHiveInstanceLock, acquireOrReuseHiveInstanceLock } = loadTs('src/main/hiveInstanceLock.ts');
const execFileAsync = promisify(execFile);

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

test('same-root re-bootstrap reuses the held lock instead of self-locking out', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-stage-lock-rebootstrap-'));
  const first = acquireHiveInstanceLock(root);
  assert.equal(first.ok, true);
  if (first.ok) {
    const again = acquireOrReuseHiveInstanceLock(first.lock, root);
    assert.equal(again.ok, true);
    if (again.ok) assert.equal(again.lock, first.lock);
    assert.equal(acquireHiveInstanceLock(root).ok, false, 'the same exclusive lock remains held');
    first.lock.release();
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test('root switch releases old lock before acquiring the new hive', () => {
  const oldRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-stage-lock-old-'));
  const newRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-stage-lock-new-'));
  const old = acquireHiveInstanceLock(oldRoot);
  assert.equal(old.ok, true);
  if (old.ok) {
    const switched = acquireOrReuseHiveInstanceLock(old.lock, newRoot);
    assert.equal(switched.ok, true);
    if (switched.ok) {
      assert.notEqual(switched.lock.path, old.lock.path);
      assert.equal(fs.existsSync(old.lock.path), false);
      assert.equal(acquireHiveInstanceLock(newRoot).ok, false, 'new root is now held');
      switched.lock.release();
    }
  }
  fs.rmSync(oldRoot, { recursive: true, force: true });
  fs.rmSync(newRoot, { recursive: true, force: true });
});

test('concurrent stale-lock contenders leave exactly one owner', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-stage-lock-race-'));
  fs.writeFileSync(path.join(root, '.agent-stage-instance.lock'), JSON.stringify({ pid: 2147483647, nonce: 'stale' }));
  const source = path.resolve('src/main/hiveInstanceLock.ts');
  const loader = path.resolve('test/load-ts.cjs');
  const script = `const a=require(${JSON.stringify(loader)});const r=a(${JSON.stringify(source)}).acquireHiveInstanceLock(process.argv[1]);process.stdout.write(JSON.stringify({ok:r.ok,pid:r.ok?process.pid:r.ownerPid}));if(r.ok)setTimeout(()=>r.lock.release(),300);`;
  const outcomes = await Promise.all([1, 2].map(() => execFileAsync(process.execPath, ['-e', script, root])));
  const parsed = outcomes.map((item) => JSON.parse(item.stdout));
  assert.equal(parsed.filter((item) => item.ok).length, 1);
  assert.equal(parsed.filter((item) => !item.ok).length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('release preserves a lock file replaced by a different owner', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-stage-lock-replaced-'));
  const acquired = acquireHiveInstanceLock(root);
  assert.equal(acquired.ok, true);
  if (acquired.ok) {
    fs.writeFileSync(acquired.lock.path, JSON.stringify({ pid: 7, nonce: 'replacement' }));
    acquired.lock.release();
    assert.equal(JSON.parse(fs.readFileSync(acquired.lock.path, 'utf8')).nonce, 'replacement');
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test('hive lock is released after will-quit, not the cancellable before-quit', () => {
  const source = fs.readFileSync(path.resolve('src/main/index.ts'), 'utf8');
  const beforeQuit = source.match(/app\.on\('before-quit',[\s\S]*?\n\}\);/);
  const willQuit = source.match(/app\.on\('will-quit',[\s\S]*?\n\}\);/);
  assert.ok(beforeQuit);
  assert.ok(willQuit);
  assert.doesNotMatch(beforeQuit[0], /hiveInstanceLock\?\.release/);
  assert.match(willQuit[0], /hiveInstanceLock\?\.release/);
});

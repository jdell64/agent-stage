const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const packageJson = require('../package.json');
const { hookEndpointForInstance } = require('./load-ts.cjs')('src/shared/hookEndpoint.ts');
const { HiveManager } = require('./load-ts.cjs')('src/main/hive.ts');

test('Windows hook pipes are stable, per userData and per hive root, and have no legacy prefix', () => {
  const a = hookEndpointForInstance('C:/Users/test/app-a', 'C:/hive/floor-one', 'win32');
  assert.equal(a, hookEndpointForInstance('C:/Users/test/app-a', 'C:/hive/floor-one', 'win32'));
  assert.notEqual(a, hookEndpointForInstance('C:/Users/test/app-b', 'C:/hive/floor-one', 'win32'));
  assert.notEqual(a, hookEndpointForInstance('C:/Users/test/app-a', 'C:/hive/floor-two', 'win32'));
  assert.match(a, /^\\\\\.\\pipe\\agent-stage-hooks-[a-f0-9]{20}$/);
  assert.doesNotMatch(a, /munder-difflin/i);
});

test('Unix socket paths live under per-instance userData and vary by hive root', () => {
  const a = hookEndpointForInstance('/tmp/app-a/userData', '/tmp/hive/one', 'linux');
  const b = hookEndpointForInstance('/tmp/app-a/userData', '/tmp/hive/two', 'linux');
  assert.notEqual(a, b);
  assert.ok(a.startsWith(path.resolve('/tmp/app-a/userData') + path.sep));
  assert.match(a, /agent-stage-hooks-[a-f0-9]{20}\.sock$/);
});

test('agent spawn injection carries the endpoint selected for its app instance', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-endpoint-instance-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const userData = path.join(base, 'userData');
  const home = path.join(base, 'home');
  fs.mkdirSync(home, { recursive: true });
  const hive = new HiveManager(() => home);
  hive.sockPath = () => hookEndpointForInstance(userData, hive.root(), 'win32');
  const injection = await hive.ensureAgent({ id: 'worker', name: 'Worker', provider: 'codex', cwd: home });
  assert.equal(injection.env.HIVE_SOCK, hookEndpointForInstance(userData, hive.root(), 'win32'));
});

test('dev:sandbox lets main derive its isolated endpoint instead of setting a shared pipe', () => {
  const script = packageJson.scripts['dev:sandbox'];
  assert.match(script, /delete env\.MD_HOOKS_PIPE/);
  assert.doesNotMatch(script, /MD_HOOKS_PIPE\s*:/);
  assert.doesNotMatch(script, /munder-difflin-dev-sandbox/i);
});

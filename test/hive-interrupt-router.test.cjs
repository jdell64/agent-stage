const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { HiveManager } = loadTs('src/main/hive.ts');
const { claimInterrupt } = loadTs('src/shared/interrupt.ts');

async function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-interrupt-router-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'acting-orchestrator', name: 'Acting Orchestrator', provider: 'claude', cwd: home, isOrchestrator: true });
  await hive.ensureAgent({ id: 'worker-a', name: 'Worker A', provider: 'claude', cwd: home });
  await hive.ensureAgent({ id: 'worker-b', name: 'Worker B', provider: 'claude', cwd: home });
  const outbox = (id) => path.join(home, 'hive', 'agents', id, 'outbox');
  const send = (sender, filename, to) => fs.writeFileSync(path.join(outbox(sender), filename), JSON.stringify({
    to, act: 'interrupt', subject: 'Interrupt current turn', body: ''
  }));
  return { hive, outbox, send };
}

test('current (including acting) orchestrator interrupt reaches the main handler and is logged', async (t) => {
  const { hive, send } = await floor(t);
  const protocol = fs.readFileSync(path.join(hive.root(), 'PROTOCOL.md'), 'utf8');
  assert.match(protocol, /Orchestrator interrupt[\s\S]*act: "interrupt"/);
  const calls = [];
  hive.setInterruptHandler((agentId) => { calls.push(agentId); return { ok: true }; });
  send('acting-orchestrator', 'interrupt.json', 'worker-a');

  assert.equal(hive.routeOnce(), 1);
  assert.deepEqual(calls, ['worker-a']);
  assert.ok(hive.logTail(100).some((entry) => entry.kind === 'interrupt-command'
    && entry.from === 'acting-orchestrator' && entry.to === 'worker-a' && entry.ok === true));
  assert.equal(hive.inbox('worker-a').some((message) => message.act === 'interrupt'), false);
});

test('non-orchestrator interrupt is refused and logged without invoking the handler', async (t) => {
  const { hive, send } = await floor(t);
  let calls = 0;
  hive.setInterruptHandler(() => { calls++; return { ok: true }; });
  send('worker-a', 'forged-interrupt.json', 'worker-b');

  assert.equal(hive.routeOnce(), 1);
  assert.equal(calls, 0);
  assert.ok(hive.logTail(100).some((entry) => entry.kind === 'interrupt-rejected'
    && entry.from === 'worker-a' && entry.to === 'worker-b' && entry.reason === 'not-orchestrator'));
});

test('orchestrator interrupt messages share the debounce gate', async (t) => {
  const { hive, send } = await floor(t);
  const lastAt = new Map();
  let now = 1_000;
  const outcomes = [];
  hive.setInterruptHandler((agentId) => {
    const ok = claimInterrupt(agentId, now, lastAt, 500);
    now += 100;
    outcomes.push(ok);
    return { ok, ...(!ok ? { error: 'interrupt already requested; please wait' } : {}) };
  });
  send('acting-orchestrator', 'first.json', 'worker-a');
  send('acting-orchestrator', 'second.json', 'worker-a');

  assert.equal(hive.routeOnce(), 2);
  assert.deepEqual(outcomes, [true, false]);
  assert.equal(hive.logTail(100).filter((entry) => entry.kind === 'interrupt-command').length, 2);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { HiveManager } = loadTs('src/main/hive.ts');
const { claimInterrupt, installScopedInterruptHandler } = loadTs('src/shared/interrupt.ts');

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

test('secondary-floor orchestrator interrupts only PTYs owned by that floor', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-interrupt-secondary-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const primary = new HiveManager(() => path.join(home, 'primary'));
  const secondary = new HiveManager(() => path.join(home, 'secondary'));
  await primary.ensureAgent({ id: 'primary-orchestrator', name: 'Primary orchestrator', provider: 'claude', cwd: home, isOrchestrator: true });
  await primary.ensureAgent({ id: 'primary-worker', name: 'Primary worker', provider: 'claude', cwd: home });
  await secondary.ensureAgent({ id: 'secondary-orchestrator', name: 'Secondary orchestrator', provider: 'claude', cwd: home, isOrchestrator: true });
  await secondary.ensureAgent({ id: 'secondary-worker', name: 'Secondary worker', provider: 'claude', cwd: home });

  const primaryMap = new Map([['pty-primary', 'primary-worker']]);
  const secondaryMap = new Map([['pty-secondary', 'secondary-worker']]);
  const primaryOwner = { floor: 'primary' };
  const secondaryOwner = { floor: 'secondary' };
  const calls = [];
  const execute = (agentId, _hive, ptyMap, owner) => {
    const pty = [...ptyMap].find(([, id]) => id === agentId)?.[0];
    calls.push({ agentId, pty, owner });
    return pty ? { ok: true } : { ok: false, error: `no live pty for agent: ${agentId}` };
  };
  installScopedInterruptHandler(primary, primaryMap, () => primaryOwner, execute);
  installScopedInterruptHandler(secondary, secondaryMap, () => secondaryOwner, execute);

  const secondaryOutbox = path.join(home, 'secondary', 'hive', 'agents', 'secondary-orchestrator', 'outbox');
  const send = (filename, to) => fs.writeFileSync(path.join(secondaryOutbox, filename), JSON.stringify({
    to, act: 'interrupt', subject: 'Interrupt current turn', body: ''
  }));
  send('same-floor.json', 'secondary-worker');
  send('cross-floor.json', 'primary-worker');

  assert.equal(secondary.routeOnce(), 2);
  assert.deepEqual(calls.sort((a, b) => a.agentId.localeCompare(b.agentId)), [
    { agentId: 'primary-worker', pty: undefined, owner: secondaryOwner },
    { agentId: 'secondary-worker', pty: 'pty-secondary', owner: secondaryOwner },
  ]);
  const commands = secondary.logTail(100).filter((entry) => entry.kind === 'interrupt-command');
  assert.deepEqual(commands.map((entry) => [entry.to, entry.ok]).sort((a, b) => a[0].localeCompare(b[0])), [
    ['primary-worker', false],
    ['secondary-worker', true]
  ]);
  assert.equal(primary.logTail(100).some((entry) => entry.kind === 'interrupt-command'), false);
});

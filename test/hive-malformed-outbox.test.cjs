'use strict';

/**
 * Regression coverage for #430: agents can publish JSON manually and leave
 * literal line-break bytes inside a string value. The router should narrowly
 * repair that malformed class, while irreparable JSON remains quarantined and
 * becomes observable in the hive log.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

async function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-malformed-outbox-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'orchestrator-1', name: 'the orchestrator', provider: 'claude', cwd: home, isOrchestrator: true });
  await hive.ensureAgent({ id: 'worker-1', name: 'Creed', provider: 'claude', cwd: home });

  const outbox = path.join(home, 'hive', 'agents', 'worker-1', 'outbox');
  return { hive, outbox };
}

function writeOutbox(outbox, filename, raw) {
  const file = path.join(outbox, filename);
  fs.writeFileSync(file, raw, 'utf8');
  return file;
}

function eventsFor(hive, filename) {
  return hive.logTail(500).filter((entry) => entry.file === filename);
}

test('valid JSON with an escaped newline keeps the fast path', async (t) => {
  const { hive, outbox } = await floor(t);
  const filename = 'valid.json';
  const body = 'first line\nsecond line';
  writeOutbox(outbox, filename, JSON.stringify({
    to: 'orchestrator', act: 'done', subject: 'done', body, requires_reply: false
  }));

  assert.equal(hive.routeOnce(), 1);
  assert.equal(hive.inbox('orchestrator-1')[0].body, body);
  assert.equal(fs.existsSync(path.join(outbox, '.sent', filename)), true);
  assert.deepEqual(eventsFor(hive, filename), []);
});

test('literal LF inside a JSON string is repaired and routed', async (t) => {
  const { hive, outbox } = await floor(t);
  const filename = 'literal-lf.json';
  const LF = String.fromCharCode(0x0A);
  const raw = '{"to":"orchestrator","act":"done","subject":"done","body":"first line'
    + LF
    + 'second line","requires_reply":false}';
  const file = writeOutbox(outbox, filename, raw);

  assert.equal(fs.readFileSync(file).includes(Buffer.from([0x0A])), true);
  assert.throws(() => JSON.parse(raw));
  assert.equal(hive.routeOnce(), 1);
  assert.equal(hive.inbox('orchestrator-1')[0].body, `first line${LF}second line`);
  assert.equal(fs.existsSync(path.join(outbox, '.sent', filename)), true);
  assert.equal(fs.existsSync(path.join(outbox, '.sent', `bad-${filename}`)), false);
  const events = eventsFor(hive, filename);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'outbox-repair');
  assert.equal(events[0].from, 'worker-1');
  assert.equal(events[0].repair, 'literal-line-break');
});

test('literal CRLF inside a JSON string is repaired and preserved', async (t) => {
  const { hive, outbox } = await floor(t);
  const filename = 'literal-crlf.json';
  const CRLF = String.fromCharCode(0x0D, 0x0A);
  const raw = '{"to":"orchestrator","act":"done","subject":"done","body":"first line'
    + CRLF
    + 'second line","requires_reply":false}';
  const file = writeOutbox(outbox, filename, raw);

  assert.equal(fs.readFileSync(file).includes(Buffer.from([0x0D, 0x0A])), true);
  assert.throws(() => JSON.parse(raw));
  assert.equal(hive.routeOnce(), 1);
  assert.equal(hive.inbox('orchestrator-1')[0].body, `first line${CRLF}second line`);
  assert.equal(eventsFor(hive, filename).filter((entry) => entry.kind === 'outbox-repair').length, 1);
  assert.equal(eventsFor(hive, filename).some((entry) => entry.kind === 'drop'), false);
});

test('irreparable structural JSON is logged and quarantined', async (t) => {
  const { hive, outbox } = await floor(t);
  const filename = 'structural.json';
  writeOutbox(outbox, filename, '{"to":"orchestrator","body":');

  assert.equal(hive.routeOnce(), 0);
  assert.equal(hive.inbox('orchestrator-1').length, 0);
  assert.equal(fs.existsSync(path.join(outbox, filename)), false);
  assert.equal(fs.existsSync(path.join(outbox, '.sent', `bad-${filename}`)), true);

  const events = eventsFor(hive, filename);
  assert.equal(events.filter((entry) => entry.kind === 'outbox-repair').length, 0);
  const drop = events.find((entry) => entry.kind === 'drop');
  assert.ok(drop);
  assert.equal(drop.reason, 'malformed-json');
  assert.equal(drop.from, 'worker-1');
  assert.equal('error' in drop, false, 'parser context and raw payload must not enter the durable log');
  const notice = hive.inbox('worker-1').find((message) => message.subject === `[outbox rejected] ${filename}`);
  assert.ok(notice, 'the sender receives a durable repair notice');
  assert.match(notice.body, /Parse error:/);
  assert.match(notice.body, /real JSON serializer/);
});

test('escaped quotes and backslashes keep their JSON semantics', async (t) => {
  const { hive, outbox } = await floor(t);
  const filename = 'escaped.json';
  const body = 'quoted: "hello"; path: C:\\tmp; escaped newline: \\n';
  writeOutbox(outbox, filename, JSON.stringify({ to: 'orchestrator', body }));

  assert.equal(hive.routeOnce(), 1);
  assert.equal(hive.inbox('orchestrator-1')[0].body, body);
  assert.deepEqual(eventsFor(hive, filename), []);
});

test('an irreparable poison file does not block a valid file in the same pass', async (t) => {
  const { hive, outbox } = await floor(t);
  writeOutbox(outbox, 'a-poison.json', '{"to":"orchestrator","body":');
  writeOutbox(outbox, 'b-good.json', JSON.stringify({ to: 'orchestrator', act: 'inform', body: 'still routed' }));

  assert.equal(hive.routeOnce(), 1);
  assert.equal(hive.inbox('orchestrator-1').length, 1);
  assert.equal(hive.inbox('orchestrator-1')[0].body, 'still routed');
  assert.equal(fs.existsSync(path.join(outbox, '.sent', 'bad-a-poison.json')), true);
  assert.equal(fs.existsSync(path.join(outbox, '.sent', 'b-good.json')), true);
  assert.equal(eventsFor(hive, 'a-poison.json')[0].reason, 'malformed-json');
});

test('outboxes without a registry entry are ignored and logged once', async (t) => {
  const { hive } = await floor(t);
  const outbox = path.join(hive.root(), 'agents', 'removed-agent', 'outbox');
  fs.mkdirSync(outbox, { recursive: true });
  fs.writeFileSync(path.join(outbox, 'phantom.json'), JSON.stringify({ to: 'orchestrator', body: 'not registered' }));

  assert.equal(hive.routeOnce(), 0);
  assert.equal(hive.routeOnce(), 0);
  assert.equal(fs.existsSync(path.join(outbox, 'phantom.json')), true);
  assert.equal(hive.logTail(100).filter((entry) => entry.reason === 'unregistered-outbox' && entry.from === 'removed-agent').length, 1);
  assert.equal(hive.inbox('orchestrator-1').length, 0);
});

test('archived but registered agents can still route their outbox', async (t) => {
  const { hive, outbox } = await floor(t);
  const registryPath = path.join(hive.root(), 'registry.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  registry.agents['worker-1'].archived = true;
  fs.writeFileSync(registryPath, JSON.stringify(registry), 'utf8');
  writeOutbox(outbox, 'archived-agent.json', JSON.stringify({ to: 'orchestrator', act: 'inform', body: 'still registered' }));

  assert.equal(hive.routeOnce(), 1);
  assert.equal(hive.inbox('orchestrator-1')[0].body, 'still registered');
});

test('an agent registered immediately before its first outbox write routes normally', async (t) => {
  const { hive } = await floor(t);
  await hive.ensureAgent({ id: 'new-agent', name: 'New agent', provider: 'claude', cwd: hive.root() });
  const outbox = path.join(hive.root(), 'agents', 'new-agent', 'outbox');
  writeOutbox(outbox, 'first-message.json', JSON.stringify({ to: 'orchestrator', act: 'inform', body: 'first write' }));

  assert.equal(hive.routeOnce(), 1);
  assert.equal(hive.inbox('orchestrator-1')[0].body, 'first write');
});

test('delivered messages are copied to durable quarantine before unlink if both archives fail', async (t) => {
  const { hive, outbox } = await floor(t);
  fs.rmSync(path.join(outbox, '.sent'), { recursive: true, force: true });
  fs.writeFileSync(path.join(outbox, '.sent'), 'block archive directory creation');
  const agents = path.join(hive.root(), 'agents');
  fs.writeFileSync(path.join(agents, '.outbox-quarantine'), 'block secondary quarantine');
  const original = JSON.stringify({ to: 'orchestrator', act: 'inform', body: 'delivered once' });
  writeOutbox(outbox, 'delivered.json', original);

  assert.equal(hive.routeOnce(), 1);
  assert.equal(hive.inbox('orchestrator-1')[0].body, 'delivered once');
  const quarantine = path.join(hive.root(), 'outbox-quarantine', 'worker-1');
  const quarantinedFile = fs.readdirSync(quarantine).find((name) => name.startsWith('delivered.json.'));
  assert.ok(quarantinedFile);
  assert.equal(fs.readFileSync(path.join(quarantine, quarantinedFile), 'utf8'), original);
  assert.equal(fs.existsSync(path.join(outbox, 'delivered.json')), false);
  assert.equal(hive.routeOnce(), 0);
  assert.equal(hive.inbox('orchestrator-1').filter((message) => message.body === 'delivered once').length, 1);
  const quarantineEvent = hive.logTail(100).find((entry) => entry.kind === 'outbox-quarantined' && entry.file === 'delivered.json');
  assert.ok(quarantineEvent);
  assert.ok(quarantineEvent.id, 'durable quarantine log identifies the dropped message');
});

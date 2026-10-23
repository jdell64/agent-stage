// T42: after a restart, App boot runs reconcileWithLivePtys, which drops the
// dead-pty orchestrator from `agents` (it auto-respawns) and persists the roster
// without it. The respawn in useHive therefore found no restored entry and fell
// back to the default portrait, even with the #8 fix. The dropped look must be
// stashed by the reconcile and consumed by the respawn.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const read = (...p) => readFileSync(join(__dirname, '..', 'src', 'renderer', 'src', ...p), 'utf8');
const store = read('store', 'store.ts');
const hive = read('hooks', 'useHive.ts');

test('reconcileWithLivePtys stashes the look of dropped orchestrator/assistant agents', () => {
  const start = store.indexOf('reconcileWithLivePtys: (livePtyIds) =>');
  const body = store.slice(start, store.indexOf('setAddAgentOpen', start));
  assert.match(body, /a\.isOrchestrator \|\| a\.isAssistant/);
  assert.match(body, /departedLooks\.set\(a\.id, \{ character: a\.character, accent: a\.accent \}\)/);
  assert.ok(body.indexOf('departedLooks.set') < body.indexOf('persistAgents(agents'));
});

test('takeDepartedLook returns and clears the stashed look', () => {
  assert.match(store, /export function takeDepartedLook\(/);
  assert.match(store, /departedLooks\.delete\(id\)/);
});

test('orchestrator respawn falls back to the stashed look before the defaults', () => {
  assert.match(hive, /takeDepartedLook/);
  const i = hive.indexOf('const restoredLook');
  assert.match(hive.slice(i, i + 260), /\?\? takeDepartedLook\(ORCHESTRATOR_ID\)/);
  assert.ok(i < hive.indexOf('removeAgent(ORCHESTRATOR_ID)'));
});

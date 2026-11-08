'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { DEFAULT_ORCHESTRATOR_NAME, resolveOrchestratorName } = loadTs('src/shared/orchestratorIdentity.ts');

test('a persisted rename wins over the default', () => {
  assert.equal(resolveOrchestratorName('Savvas'), 'Savvas');
  assert.equal(resolveOrchestratorName('  Savvas  '), 'Savvas'); // trimmed, like renameAgent() trims on write
});

test('nothing persisted yet falls back to the default', () => {
  assert.equal(resolveOrchestratorName(undefined), DEFAULT_ORCHESTRATOR_NAME);
  assert.equal(resolveOrchestratorName(null), DEFAULT_ORCHESTRATOR_NAME);
  assert.equal(resolveOrchestratorName(''), DEFAULT_ORCHESTRATOR_NAME);
  assert.equal(resolveOrchestratorName('   '), DEFAULT_ORCHESTRATOR_NAME); // whitespace-only is not a real name
});

const id = loadTs('src/shared/orchestratorIdentity.ts');

test('display name precedence: the user\'s rename, then the theme\'s suggestion, then the default', () => {
  id.setThemeOrchestratorName(null);
  assert.equal(id.resolveOrchestratorName(undefined), id.DEFAULT_ORCHESTRATOR_NAME);
  id.setThemeOrchestratorName('Captain');
  assert.equal(id.resolveOrchestratorName(undefined), 'Captain');
  assert.equal(id.resolveOrchestratorName('   '), 'Captain', 'a blank rename does not hide the theme name');
  assert.equal(id.resolveOrchestratorName('Boss'), 'Boss', 'the user\'s own rename wins');
  id.setThemeOrchestratorName(null);
});

test('theme-supplied names are sanitised', () => {
  for (const bad of ['', '  ', 'x'.repeat(41), 'a\u0000b', 'a\nb', 7, null, undefined]) {
    assert.equal(id.sanitizeDisplayName(bad), null, JSON.stringify(bad));
  }
  assert.equal(id.sanitizeDisplayName('  Number One '), 'Number One');
  id.setThemeOrchestratorName('a\nb');
  assert.equal(id.getThemeOrchestratorName(), null);
});

test('isOrchestratorAddress resolves "orchestrator" even when acting orchestrator has a worker id', () => {
  assert.equal(id.isOrchestratorAddress('orchestrator', 'codex-data'), true);
  assert.equal(id.isOrchestratorAddress('human', 'codex-data'), true);
  assert.equal(id.isOrchestratorAddress(id.LEGACY_ORCHESTRATOR_IDS[0], 'codex-data'), true);
  assert.equal(id.isOrchestratorAddress('codex-data', 'codex-data'), true);
  assert.equal(id.isOrchestratorAddress('other-worker', 'codex-data'), false);
});

test('promoteOrchestrator hands over floor authority, migrates unread inbox, and restores original orchestrator', async (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { HiveManager } = loadTs('src/main/hive.ts');

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-promote-orch-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home, () => true);

  await hive.ensureAgent({ id: 'orchestrator', name: 'Picard', provider: 'claude', cwd: home, isOrchestrator: true, role: 'orchestrator' });
  await hive.ensureAgent({ id: 'codex-data', name: 'Data', provider: 'codex', cwd: home, role: 'backend-engineer' });
  await hive.ensureAgent({ id: 'worker-worf', name: 'Worf', provider: 'claude', cwd: home, role: 'security' });

  // Worf sends a reply to "orchestrator" while Picard is out of tokens (unread in Picard's inbox).
  hive.send({ to: 'orchestrator', act: 'inform', subject: 'Shields status', body: 'All frequencies calibrated.' }, 'worker-worf');
  assert.equal(hive.inbox('orchestrator').length, 1);

  // Promote Data to Acting Orchestrator.
  const promoted = hive.promoteOrchestrator('codex-data', { holdOutgoing: true, migrateInbox: true });
  assert.equal(promoted.ok, true);
  assert.equal(promoted.orchestratorId, 'codex-data');
  assert.equal(promoted.previousOrchestratorId, 'orchestrator');
  assert.equal(promoted.migratedCount, 1);

  const regAfterPromote = hive.registry();
  assert.equal(regAfterPromote.orchestratorId, 'codex-data');
  assert.equal(regAfterPromote.previousOrchestratorId, 'orchestrator');
  assert.equal(regAfterPromote.agents['codex-data'].isOrchestrator, true);
  assert.equal(regAfterPromote.agents['codex-data'].role, 'orchestrator');
  assert.equal(regAfterPromote.agents['codex-data'].previousRole, 'backend-engineer');
  assert.equal(regAfterPromote.agents['orchestrator'].isOrchestrator, false);
  assert.equal(regAfterPromote.agents['orchestrator'].onHold, true);

  // Picard's inbox now holds only the stand-down notice; Data's inbox has the migrated message + charter briefing.
  const picardInbox = hive.inbox('orchestrator');
  assert.equal(picardInbox.length, 1);
  assert.match(picardInbox[0].subject, /Orchestrator Handover/);

  const dataInbox = hive.inbox('codex-data');
  assert.equal(dataInbox.some((m) => m.subject === 'Shields status'), true, 'unread message was migrated to acting orchestrator');
  assert.equal(dataInbox.some((m) => /Orchestrator Promotion/.test(m.subject)), true, 'charter briefing was delivered to acting orchestrator');

  // New messages addressed to "orchestrator" now route directly to Data.
  hive.send({ to: 'orchestrator', act: 'query', subject: 'Need sign-off', body: 'Ready to merge PR?' }, 'worker-worf');
  assert.equal(hive.inbox('codex-data').some((m) => m.subject === 'Need sign-off'), true);

  // Restore Picard as Orchestrator.
  const restored = hive.promoteOrchestrator('orchestrator', { holdOutgoing: false, migrateInbox: true });
  assert.equal(restored.ok, true);
  assert.equal(restored.orchestratorId, 'orchestrator');
  assert.equal(restored.previousOrchestratorId, null);
  assert.equal(restored.oldRoleRestored, 'backend-engineer');

  const regAfterRestore = hive.registry();
  assert.equal(regAfterRestore.orchestratorId, 'orchestrator');
  assert.equal(regAfterRestore.previousOrchestratorId, null);
  assert.equal(regAfterRestore.agents['orchestrator'].isOrchestrator, true);
  assert.equal(regAfterRestore.agents['orchestrator'].onHold, false);
  assert.equal(regAfterRestore.agents['codex-data'].isOrchestrator, false);
  assert.equal(regAfterRestore.agents['codex-data'].role, 'backend-engineer');
});

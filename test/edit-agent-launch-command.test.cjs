const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../src/renderer/src/components/EditAgentModal.tsx'),
  'utf8'
);

test('Edit Agent saves the hand-edited launch command and applies model swaps to it', () => {
  assert.match(source, /const \[launchCommand, setLaunchCommand\] = useState\(agent\.command \?\? ''\)/);
  assert.match(source, /value=\{launchCommand\}[\s\S]*?onChange=\{\(e\) => setLaunchCommand\(e\.target\.value\)\}/);
  assert.match(source, /applyModelToCommandLine\(editedCommand, model, provider\)/);
  assert.match(source, /hivePatchAgentCommand\?\.\(agent\.id, command\.trim\(\)\)/);
});

test('Edit Agent explains restart timing and links to the Command Center Floor tab', () => {
  assert.match(source, /Changes take effect only when the agent or harness restarts/);
  assert.match(source, /requestCommandCenterTab\('floor'\)/);
  assert.match(source, /Command Center → Floor restart/);
});

test('Edit Agent saves every name through the hive before updating the roster', () => {
  const saveStart = source.indexOf('const save = async () =>');
  const save = source.slice(saveStart, source.indexOf('\n  return (', saveStart));
  assert.match(save, /const renameResult = await renameAgent\(agent\.id, trimmedName\)/);
  assert.ok(save.indexOf('await renameAgent(') < save.indexOf('updateAgent(agent.id, {'));
  assert.match(save, /if \(!renameResult\.ok\) \{[\s\S]*?setSaveError\([\s\S]*?return;/);
  assert.doesNotMatch(save, /trimmedName\s*===\s*agent\.name/);
  assert.doesNotMatch(save, /updateAgent\(agent\.id,\s*\{\s*name:/);
});

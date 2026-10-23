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

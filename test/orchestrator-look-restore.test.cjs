// A floor restore re-spawns the orchestrator and rebuilds its card. The card must
// keep the portrait/accent the restored entry already had, not snap back to the
// default orchestrator face.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const src = readFileSync(join(__dirname, '..', 'src', 'renderer', 'src', 'hooks', 'useHive.ts'), 'utf8');

test('orchestrator respawn reuses the restored entry character and accent', () => {
  assert.match(src, /const restoredLook = useStore\.getState\(\)\.agents\.find\(\(x\) => x\.id === ORCHESTRATOR_ID\)/);
  assert.ok(src.indexOf('const restoredLook') < src.indexOf('removeAgent(ORCHESTRATOR_ID)'), 'capture before removal');
  assert.match(src, /character: restoredLook\?\.character \? normalizeCharacter\(restoredLook\.character\) : ORCHESTRATOR_CHARACTER/);
  assert.match(src, /accent: restoredLook\?\.accent \?\? 'lemon'/);
});

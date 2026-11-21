const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('lock-denied second instance quits after readiness before boot, window creation, or floor restore', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  const ready = source.indexOf('app.whenReady().then(() => {');
  const guard = source.indexOf('if (!gotInstanceLock) {', ready);
  const quit = source.indexOf('app.quit();', guard);
  const earlyReturn = source.indexOf('return;', quit);
  const create = source.indexOf('\n  createWindow();', ready);
  const restore = source.indexOf('\n  restoreOpenFloors();', ready);
  const bootstrap = source.indexOf('bootstrapHiveServices();', ready);
  assert.ok(ready >= 0 && guard > ready);
  assert.ok(quit > guard && earlyReturn > quit);
  assert.ok(create > earlyReturn && restore > create);
  assert.ok(bootstrap > earlyReturn);
});

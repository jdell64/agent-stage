const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('a lock-denied second instance cannot bootstrap the hive', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  const ready = source.indexOf('app.whenReady().then(() => {');
  const guard = source.indexOf('if (!gotInstanceLock) return;', ready);
  const bootstrap = source.indexOf('bootstrapHiveServices();', ready);
  assert.ok(ready >= 0, 'startup callback exists');
  assert.ok(guard > ready && guard < bootstrap, 'lock guard runs before hive bootstrap');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'main', 'index.ts'),
  'utf8'
);

test('main window permits the compact laptop-sized layout', () => {
  assert.match(source, /const MIN_WIN = \{ width: 1024, height: 640 \};/);
  assert.match(source, /minWidth: MIN_WIN\.width/);
  assert.match(source, /minHeight: MIN_WIN\.height/);
});

test('restored bounds continue to use the same minimum clamp', () => {
  assert.match(source, /const width = Math\.max\(MIN_WIN\.width, Math\.round\(r\.width\)\)/);
  assert.match(source, /const height = Math\.max\(MIN_WIN\.height, Math\.round\(r\.height\)\)/);
});

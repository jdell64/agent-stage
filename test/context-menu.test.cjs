const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');

test('window context menu exposes spellcheck suggestions and edit actions', () => {
  assert.match(source, /wc\.on\('context-menu'/);
  assert.match(source, /params\.dictionarySuggestions\.slice\(0, 5\)/);
  assert.match(source, /replaceMisspelling\(suggestion\)/);
  assert.match(source, /role: 'cut'/);
  assert.match(source, /role: 'copy'/);
  assert.match(source, /role: 'paste'/);
  assert.match(source, /role: 'selectAll'/);
});

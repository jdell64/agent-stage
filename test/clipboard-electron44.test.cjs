// Electron 44 made the clipboard API async and removed readImage(). A regression
// here silently broke pasting images into the Queue, so pin the main-process
// handlers to the async API at source level.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const src = readFileSync(join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');

test('main never calls the removed synchronous clipboard.readImage()', () => {
  assert.doesNotMatch(src, /clipboard\.readImage\s*\(/);
});

test('clipboard:saveImage reads image items through the async clipboard.read()', () => {
  const start = src.indexOf("ipcMain.handle('clipboard:saveImage'");
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf('\n});\n', start));
  assert.match(body, /await clipboard\.read\(\)/);
  assert.match(body, /startsWith\('image\/'\)/);
});

test('text clipboard handlers await the async readText/writeText', () => {
  assert.match(src, /await clipboard\.writeText\(text\)/);
  assert.match(src, /await clipboard\.readText\(\)/);
  assert.doesNotMatch(src, /evt\.returnValue = clipboard\.readText\(\)/);
});

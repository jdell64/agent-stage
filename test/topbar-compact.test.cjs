const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'src', 'App.tsx'), 'utf8');
const globalCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'src', 'design', 'global.css'), 'utf8');

test('titlebar uses compact chrome spacing', () => {
  assert.match(app, /height: 32, minHeight: 32/);
  assert.match(app, /paddingLeft: 72/);
  assert.match(app, /paddingRight: 8/);
  assert.match(app, /gap: 6/);
});

test('long floor paths are bounded and hidden at the compact breakpoint', () => {
  assert.match(app, /className="cth-titlebar-floor-path"/);
  assert.match(globalCss, /\.cth-titlebar-floor-path[\s\S]*max-width: 16vw/);
  assert.match(globalCss, /@media \(max-width: 1100px\)[\s\S]*\.cth-titlebar-floor-path \{ display: none; \}/);
});

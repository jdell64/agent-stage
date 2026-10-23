// Typing "..." in a JetBrains Mono textarea painted "here .." until a full repaint:
// calt ligatures change earlier glyphs outside Chromium's caret dirty rect.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const css = readFileSync(join(__dirname, '..', 'src', 'renderer', 'src', 'design', 'global.css'), 'utf8');

test('editable controls disable ligatures and contextual alternates', () => {
  const m = /(?:^|\n)input,\s*textarea,\s*\[contenteditable\]\s*\{([^}]*)\}/.exec(css);
  assert.ok(m, 'rule for input/textarea/[contenteditable] present');
  assert.match(m[1], /font-variant-ligatures:\s*none/);
  assert.match(m[1], /"calt"\s*0/);
});

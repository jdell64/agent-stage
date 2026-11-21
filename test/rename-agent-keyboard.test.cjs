const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('rename modal traps keyboard events inside its content boundary', () => {
  const source = read('src/renderer/src/components/EditAgentModal.tsx');
  assert.match(
    source,
    /onKeyDown=\{\(e\) => e\.stopPropagation\(\)\}/,
    'the Edit Agent dialog must stop Delete/Backspace and other editing keys from bubbling'
  );
});

test('inline rename input stops propagation before handling Enter or Escape', () => {
  const source = read('src/renderer/src/components/AgentNameEditor.tsx');
  const inputStart = source.indexOf('if (editing)');
  const input = source.slice(inputStart, source.indexOf('\n    );', inputStart));
  assert.match(input, /onKeyDown=\{\(event\) => \{[\s\S]*?event\.stopPropagation\(\)/);
});

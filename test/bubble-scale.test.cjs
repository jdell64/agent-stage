const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const scaleSource = fs.readFileSync(path.join(
  __dirname, '..', 'src/renderer/src/scene/office/bubbleScale.ts'), 'utf8');
const compiled = ts.transpileModule(scaleSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports, Number });

test('bubble counter-scale keeps screen size stable at fit and focus zooms', () => {
  const { bubbleCounterScale } = moduleExports;
  for (const zoom of [0.5, 1, 2, 4]) {
    const renderedScale = zoom * bubbleCounterScale(zoom);
    assert.equal(renderedScale, 1, `expected stable screen size at zoom ${zoom}`);
  }
  assert.equal(bubbleCounterScale(0), 1);
  assert.equal(bubbleCounterScale(Number.POSITIVE_INFINITY), 1);
});

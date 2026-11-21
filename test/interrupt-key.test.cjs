const test = require('node:test');
const assert = require('node:assert/strict');
const { interruptKeyForProvider } = require('./load-ts.cjs')('src/shared/interrupt.ts');

test('Claude interrupt uses Escape', () => assert.equal(interruptKeyForProvider('claude'), '\u001b'));
test('Codex and unknown interrupt use one Ctrl+C', () => {
  assert.equal(interruptKeyForProvider('codex'), '\u0003');
  assert.equal(interruptKeyForProvider(undefined), '\u0003');
});

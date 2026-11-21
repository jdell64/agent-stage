const test = require('node:test');
const assert = require('node:assert/strict');
const {
  claimInterrupt,
  interruptAuditBody,
  interruptKeyForProvider,
  interruptKeyNameForProvider
} = require('./load-ts.cjs')('src/shared/interrupt.ts');

test('Claude interrupt uses Escape', () => assert.equal(interruptKeyForProvider('claude'), '\u001b'));
test('Codex and unknown interrupt use one Ctrl+C', () => {
  assert.equal(interruptKeyForProvider('codex'), '\u0003');
  assert.equal(interruptKeyForProvider(undefined), '\u0003');
});

test('interrupt key labels match each provider', () => {
  assert.equal(interruptKeyNameForProvider('claude'), 'Esc');
  assert.equal(interruptKeyNameForProvider('grok'), 'Ctrl+C');
});

test('interrupt debounce admits first request, rejects a rapid repeat, then expires', () => {
  const lastAt = new Map();
  assert.equal(claimInterrupt('a', 1000, lastAt, 500), true);
  assert.equal(claimInterrupt('a', 1499, lastAt, 500), false);
  assert.equal(claimInterrupt('a', 1500, lastAt, 500), true);
  assert.equal(claimInterrupt('b', 1500, lastAt, 500), true);
});

test('audit notice records the key actually sent and preserves the session', () => {
  assert.match(interruptAuditBody('claude'), /interrupted.*Esc.*PTY and session remain alive/);
  assert.match(interruptAuditBody('codex'), /interrupted.*Ctrl\+C.*PTY and session remain alive/);
});

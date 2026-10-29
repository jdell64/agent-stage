const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src/renderer/src/scene/office/bubbleScale.ts'),
  'utf8',
);

test('bubble counter-scale is inverse at fit and focus zooms', () => {
  assert.match(source, /return zoom > 0 && Number\.isFinite\(zoom\) \? 1 \/ zoom : 1;/);
  assert.match(source, /export function bubbleCounterScale\(zoom: number\)/);
});

test('ThoughtBubble applies counter-scale instead of clamping only zoom-out', () => {
  const thoughtBubble = fs.readFileSync(
    path.join(__dirname, '..', 'src/renderer/src/scene/office/ThoughtBubble.ts'),
    'utf8',
  );
  assert.match(thoughtBubble, /this\.container\.scale\.set\(bubbleCounterScale\(z\)\)/);
  assert.doesNotMatch(thoughtBubble, /Math\.min\(this\.zoom, 1\)/);
});

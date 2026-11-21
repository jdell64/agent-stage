const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const {
  QuotaWakeScheduler,
  QUOTA_WAKE_JITTER_MS,
  quotaWakeJitterForAgent,
  QUOTA_WAKE_RETRY_MS,
  clearInboxWakeDedup,
  markQuotaNoticeSeen,
  resetAtForEngine
} = loadTs('src/main/quotaWake.ts');

const base = { agentId: 'a', ptyId: 'p', idle: true, lastActivityAt: 100 };

test('quota wake fires once after reset plus jitter', () => {
  const q = new QuotaWakeScheduler();
  q.schedule('a', 'claude', 1000, ['m1'], 0);
  const wakeAt = 1000 + quotaWakeJitterForAgent('a');
  assert.deepEqual(q.tick([base], wakeAt - 1), []);
  assert.deepEqual(q.tick([base], wakeAt), [
    { kind: 'wake', agentId: 'a', inboxIds: ['m1'], attempt: 1 }
  ]);
  assert.deepEqual(q.tick([base], wakeAt + 1), []);
});

test('busy agent is skipped and remains eligible once idle', () => {
  const q = new QuotaWakeScheduler();
  q.schedule('a', 'claude', 1000, ['m1'], 0);
  const due = 1000 + quotaWakeJitterForAgent('a');
  assert.deepEqual(q.tick([{ ...base, idle: false }], due), []);
  assert.equal(q.tick([base], due)[0].kind, 'wake');
});

test('agents sharing a reset get distinct deterministic wake offsets', () => {
  const aOffset = quotaWakeJitterForAgent('worker-a');
  const bOffset = quotaWakeJitterForAgent('worker-b');
  assert.ok(aOffset >= 5_000 && aOffset <= QUOTA_WAKE_JITTER_MS);
  assert.ok(bOffset >= 5_000 && bOffset <= QUOTA_WAKE_JITTER_MS);
  assert.notEqual(aOffset, bOffset);
  assert.equal(aOffset, quotaWakeJitterForAgent('worker-a'));

  const q = new QuotaWakeScheduler();
  q.schedule('worker-a', 'claude', 1000, ['a'], 0);
  q.schedule('worker-b', 'claude', 1000, ['b'], 0);
  const facts = [
    { ...base, agentId: 'worker-a' },
    { ...base, agentId: 'worker-b' }
  ];
  const firstAt = 1000 + Math.min(aOffset, bOffset);
  const lastAt = 1000 + Math.max(aOffset, bOffset);
  assert.equal(q.tick(facts, firstAt)[0].kind, 'wake');
  assert.equal(q.tick(facts, lastAt).length, 1);
});

test('retries stop at three and emit wake-failed', () => {
  const q = new QuotaWakeScheduler();
  q.schedule('a', 'claude', 1000, ['m1'], 0);
  let now = 1000 + quotaWakeJitterForAgent('a');
  for (let attempt = 1; attempt <= 3; attempt++) {
    assert.equal(q.tick([base], now)[0].attempt, attempt);
    now += QUOTA_WAKE_RETRY_MS;
  }
  assert.deepEqual(q.tick([base], now), [{ kind: 'failed', agentId: 'a', attempts: 3 }]);
  assert.deepEqual(q.tick([base], now + QUOTA_WAKE_RETRY_MS), []);
});

test('quota wake clears only dedup ids for paused inbox messages', () => {
  const seen = new Set(['old', 'paused-1', 'paused-2']);
  clearInboxWakeDedup(seen, ['paused-1', 'paused-2']);
  assert.deepEqual([...seen], ['old']);
});

test('quota notice detection handles split PTY output and reset snapshots', () => {
  const tails = new Map();
  assert.equal(markQuotaNoticeSeen(tails, 'a', "You've hit your usage "), false);
  assert.equal(markQuotaNoticeSeen(tails, 'a', 'limit.'), true);
  const resetAt = resetAtForEngine({ agents: { claude: { windows: {
    five_hour: { resetsAt: '2099-01-01T00:00:00Z' }
  } } } }, 'claude');
  assert.equal(resetAt, Date.parse('2099-01-01T00:00:00Z'));
});

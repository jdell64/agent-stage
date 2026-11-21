const test = require('node:test');
const assert = require('node:assert/strict');
const { createConnection } = require('node:net');
const { randomUUID } = require('node:crypto');
const { HookServer } = require('./load-ts.cjs')('src/main/hooks.ts');

test('old Windows hook pipe remains served for already-running agents', { skip: process.platform !== 'win32' }, async () => {
  const suffix = randomUUID().replaceAll('-', '');
  const current = `\\\\.\\pipe\\agent-stage-test-${suffix}`;
  const legacy = `\\\\.\\pipe\\munder-difflin-${suffix.slice(0, 12)}`;
  const hive = {
    sockPath: () => current,
    legacySockPath: () => legacy,
    appendLog: () => {},
    root: () => 'C:/test-hive'
  };
  const hooks = new HookServer(hive, () => null, () => ({}));
  hooks.start();
  try {
    await hooks.ensureListening();
    const response = await new Promise((resolve, reject) => {
      const conn = createConnection(legacy, () => conn.write(JSON.stringify({ ping: 'old-agent' }) + '\n'));
      let data = '';
      conn.setEncoding('utf8');
      conn.on('data', (chunk) => { data += chunk; });
      conn.on('end', () => resolve(JSON.parse(data)));
      conn.on('error', reject);
    });
    assert.equal(response.pong, 'old-agent');
    assert.equal(typeof response.instance, 'string');
  } finally {
    hooks.stop();
  }
});

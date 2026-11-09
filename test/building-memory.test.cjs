'use strict';

/**
 * Cross-floor shared memory (T-floors-v2). Floors are isolated for work but share a
 * building-level notes layer: one append-only file per floor, readable by every
 * floor, indexed by a single process-wide MemPalace writer. These pin the parts
 * that must hold with NO mempalace installed (the plain-file layer) and the way the
 * layer reaches an agent's prompt.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { BuildingMemory, buildingWingFor } = loadTs('src/main/buildingMemory.ts');
const { HiveManager } = loadTs('src/main/hive.ts');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function building(t) {
  const dir = tmp('md-building-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Semantic memory off: the plain-file layer must work without mempalace.
  return { dir, bm: new BuildingMemory(() => dir, () => ({ enabled: false, model: 'minilm' })) };
}

test('a floor keeps one stable wing, keyed by its folder (not its number or alias)', () => {
  const a = buildingWingFor(path.join(os.tmpdir(), 'client-app'));
  assert.equal(a, buildingWingFor(path.join(os.tmpdir(), 'client-app')), 'same folder, same wing');
  assert.notEqual(a, buildingWingFor(path.join(os.tmpdir(), 'other', 'client-app')), 'same basename, different folder');
  assert.match(a, /^client-app-[0-9a-f]{6}$/);
});

test('each floor gets its OWN notes file under one shared directory', (t) => {
  const { dir, bm } = building(t);
  const one = bm.ensureWing(path.join(os.tmpdir(), 'floor-one'), 'Floor One');
  const two = bm.ensureWing(path.join(os.tmpdir(), 'floor-two'), 'Floor Two');

  assert.notEqual(one.file, two.file, 'two floors must never share a write target');
  assert.equal(one.dir, two.dir, 'but they read the same building directory');
  assert.equal(one.dir, path.join(dir, 'hive', 'agents'));
  assert.ok(fs.existsSync(one.file) && fs.existsSync(two.file));
  assert.match(fs.readFileSync(one.file, 'utf8'), /Floor One/);
  assert.ok(fs.existsSync(path.join(dir, 'README.md')), 'the layout is documented next to the data');
});

test('provisioning is idempotent and never clobbers notes already written', (t) => {
  const { bm } = building(t);
  const home = path.join(os.tmpdir(), 'floor-keep');
  const first = bm.ensureWing(home, 'Keep');
  fs.appendFileSync(first.file, '\n- the deploy window is Tuesdays\n');
  const again = bm.ensureWing(home, 'Keep renamed');
  assert.equal(again.file, first.file, 'renaming a floor must not move its memory');
  assert.match(fs.readFileSync(again.file, 'utf8'), /deploy window is Tuesdays/);
});

test('another floor can read what this floor wrote (cross-floor read)', (t) => {
  const { bm } = building(t);
  const writer = bm.ensureWing(path.join(os.tmpdir(), 'writer-floor'), 'Writer');
  const reader = bm.ensureWing(path.join(os.tmpdir(), 'reader-floor'), 'Reader');
  fs.appendFileSync(writer.file, '\n- API v2 ships behind the `x-api-version` header\n');

  const seen = fs
    .readdirSync(reader.dir)
    .map((wing) => fs.readFileSync(path.join(reader.dir, wing, 'memory.md'), 'utf8'))
    .join('\n');
  assert.match(seen, /x-api-version/);
});

test('env and prompt expose the layer with absolute paths and no shell syntax', (t) => {
  const { bm } = building(t);
  const handle = bm.ensureWing(path.join(os.tmpdir(), 'env-floor'), 'Env');
  const env = bm.env(handle);

  assert.equal(env.CTH_BUILDING_MEMORY_FILE, handle.file);
  assert.equal(env.CTH_BUILDING_MEMORY_DIR, handle.dir);
  assert.equal('CTH_BUILDING_PALACE_PATH' in env, false, 'no palace advertised when semantic memory is off');

  const line = bm.promptLine(handle);
  assert.ok(line.includes(handle.file) && line.includes(handle.dir));
  assert.equal(line.includes('$'), false, 'a $VAR is dead on Windows shells; paths must be baked in');
  assert.equal(line.includes('mempalace'), false, 'no semantic-search advice without a palace');
});

test('the agent sandbox may write only its own floor wing, never a sibling floor', (t) => {
  const { dir, bm } = building(t);
  const mine = bm.ensureWing(path.join(os.tmpdir(), 'mine-floor'), 'Mine');
  const other = bm.ensureWing(path.join(os.tmpdir(), 'theirs-floor'), 'Theirs');
  const writable = bm.writableDirs(mine);
  assert.ok(writable.includes(path.dirname(mine.file)));
  assert.equal(writable.includes(path.dirname(other.file)), false);
  assert.equal(writable.includes(dir), false, 'the whole building root must not be writable');
});

test('the shared palace remains read-only to agents while the app owns indexing', (t) => {
  const { dir, bm } = building(t);
  const mine = {
    wing: 'mine-floor',
    file: path.join(dir, 'hive', 'agents', 'mine-floor', 'memory.md'),
    dir: path.join(dir, 'hive', 'agents'),
    palace: path.join(dir, 'palace')
  };
  const writable = bm.writableDirs(mine);
  assert.equal(writable.includes(mine.palace), false, 'agent allowWrite must not include the shared palace');
  assert.match(bm.promptLine(mine), /do not run MemPalace CLI commands/);
});

test('the building line reaches the agent system prompt', async (t) => {
  const home = tmp('md-building-hive-');
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();

  const line = 'Building memory (shared across ALL floors): SENTINEL-LINE';
  const withLine = await hive.ensureAgent(
    { id: 'a1', name: 'A', provider: 'claude', cwd: home },
    { buildingMemoryLine: line }
  );
  const prompt = withLine.args[withLine.args.indexOf('--append-system-prompt') + 1];
  assert.ok(prompt.includes('SENTINEL-LINE'));

  const without = await hive.ensureAgent({ id: 'a2', name: 'B', provider: 'claude', cwd: home }, {});
  const bare = without.args[without.args.indexOf('--append-system-prompt') + 1];
  assert.equal(bare.includes('Building memory'), false, 'no line when the layer is not provisioned');
});

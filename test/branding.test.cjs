'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

test('packaged build assets and app brand assets contain no Munder Difflin branding', () => {
  const files = [...filesUnder(path.join(root, 'build')), path.join(root, 'docs/logo.svg'), path.join(root, 'docs/logo.png')];
  for (const file of files) {
    const contents = fs.readFileSync(file).toString('latin1');
    assert.doesNotMatch(contents, /munder/i, path.relative(root, file));
  }
});

test('the source-of-truth mark and platform icons are generated', () => {
  const svg = fs.readFileSync(path.join(root, 'build/icon.svg'), 'utf8');
  assert.match(svg, /<title>Agent Stage<\/title>/);
  assert.doesNotMatch(svg, /<text\b|Michael|Munder/i);
  assert.match(fs.readFileSync(path.join(root, 'docs/logo.svg'), 'utf8'), /<title>Agent Stage<\/title>/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'build/icon.png')).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.deepEqual(fs.readFileSync(path.join(root, 'docs/logo.png')).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(fs.readFileSync(path.join(root, 'build/icon.ico')).readUInt16LE(0), 0);
  assert.equal(fs.readFileSync(path.join(root, 'build/icon.ico')).readUInt16LE(2), 1);
  assert.equal(fs.readFileSync(path.join(root, 'build/icon.icns')).toString('ascii', 0, 4), 'icns');
});

test('splash and packaged runtime point at Agent Stage icon assets', () => {
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8');
  assert.match(html, /<div class="title">AGENT STAGE<\/div>/);
  assert.doesNotMatch(html, /MUNDER DIFFLIN/i);
  assert.match(builder, /icon: build\/icon\.icns/);
  assert.match(builder, /icon: build\/icon\.ico/);
  assert.match(builder, /icon: build\/icon\.png/);
  assert.match(main, /'icon\.ico' : 'icon\.png'/);
});

// Windows taskbar icon: the dev build showed the generic Electron icon. Pin the
// AppUserModelID to the packaged appId and hand Windows the .ico.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const main = readFileSync(join(root, 'src', 'main', 'index.ts'), 'utf8');
const builder = readFileSync(join(root, 'electron-builder.yml'), 'utf8');

test('AppUserModelID matches the electron-builder appId and is set on win32', () => {
  const id = /APP_USER_MODEL_ID = '([^']+)'/.exec(main)?.[1];
  assert.ok(id);
  assert.match(builder, new RegExp(`^appId: ${id.replace(/\./g, '\.')}\s*$`, 'm'));
  assert.match(main, /app\.setAppUserModelId\(APP_USER_MODEL_ID\)/);
});

test('windows use the .ico on win32 and the same file ships as a resource', () => {
  assert.match(main, /process\.platform === 'win32' \? 'agent-stage\.ico' : 'agent-stage\.png'/);
  assert.match(main, /icon: iconPath/);
  assert.match(main, /nativeImage\.createFromPath\(iconPath\)/);
  assert.match(main, /win\.setIcon\(nativeWindowIcon\)/);
  assert.match(main, /ready-to-show.*[\s\S]*nativeWindowIcon/);
  assert.match(main, /setAppDetails\(\{ appId: APP_USER_MODEL_ID, appIconPath: iconPath/);
  assert.match(builder, /from: build\/agent-stage\.ico\s+to: agent-stage\.ico/);
  assert.ok(existsSync(join(root, 'build', 'agent-stage.ico')));
});

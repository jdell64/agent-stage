'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function sandboxEnvironment(root, inherited = process.env) {
  const base = path.resolve(root);
  const home = path.join(base, 'home');
  const appData = path.join(home, 'AppData', 'Roaming');
  const localAppData = path.join(home, 'AppData', 'Local');
  const env = {
    ...inherited,
    MD_USER_DATA_DIR: path.join(base, 'userData'),
    MD_THEMES_DIR: path.join(base, 'themes'),
    MD_HIVE_ROOT: path.join(base, 'harness'),
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    USERPROFILE: home,
    HOME: home,
    TMP: path.join(base, 'tmp'),
    TEMP: path.join(base, 'tmp'),
    XDG_CONFIG_HOME: path.join(base, 'config'),
    XDG_DATA_HOME: path.join(base, 'data'),
    XDG_CACHE_HOME: path.join(base, 'cache'),
    npm_config_cache: path.join(base, 'cache', 'npm'),
    CODEX_HOME: path.join(home, '.codex')
  };
  delete env.MD_HOOKS_PIPE;
  return env;
}

function launch() {
  const root = process.env.MD_SANDBOX_DIR
    || path.join(os.tmpdir(), 'agent-stage-sandbox');
  const env = sandboxEnvironment(root);
  for (const key of [
    'MD_USER_DATA_DIR', 'MD_THEMES_DIR', 'MD_HIVE_ROOT', 'APPDATA', 'LOCALAPPDATA',
    'USERPROFILE', 'HOME', 'TMP', 'TEMP', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
    'XDG_CACHE_HOME', 'npm_config_cache', 'CODEX_HOME'
  ]) fs.mkdirSync(env[key], { recursive: true });
  const child = spawn('npx', ['electron-vite', 'dev'], {
    stdio: 'inherit',
    shell: true,
    env
  });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
}

if (require.main === module) launch();

module.exports = { sandboxEnvironment };

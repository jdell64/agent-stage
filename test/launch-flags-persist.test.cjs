'use strict';

/**
 * T34 — Harness relaunch / resume / restart / edit must preserve an agent's
 * custom launch command and flags (`codex -a never -s danger-full-access`, etc.)
 * across all providers, falling back to the provider default ONLY when nothing
 * was persisted, and combining session-resume args in the right order.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const {
  tokenizeCommand,
  quoteCommandToken,
  formatCommandLine,
  applyModelToCommandLine,
  applyResumeToArgs,
  resolveSpawnCommandAndFlags
} = loadTs('src/shared/commandLine.ts');
const { argsWithAutoModeFlag, inferAgentProvider } = loadTs('src/shared/agentProvider.ts');
const { buildWorkerLaunch } = loadTs('src/main/workerLaunch.ts');
const { buildSpawnCommand } = loadTs('src/renderer/src/store/config.ts');
const { HiveManager } = loadTs('src/main/hive.ts');

function makeTempHive() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-stage-t34-'));
  const hive = new HiveManager(() => dir);
  return {
    dir,
    hive,
    cleanup() {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  };
}

test('formatCommandLine and tokenizeCommand round-trip custom flags and quoted model names', () => {
  const cmd = formatCommandLine('codex', ['-a', 'never', '-s', 'danger-full-access']);
  assert.equal(cmd, 'codex -a never -s danger-full-access');
  assert.deepEqual(tokenizeCommand(cmd), ['codex', '-a', 'never', '-s', 'danger-full-access']);

  const agyCmd = formatCommandLine('agy', ['--model', 'Gemini 3.1 Pro (High)', '--dangerously-skip-permissions']);
  assert.equal(agyCmd, 'agy --model "Gemini 3.1 Pro (High)" --dangerously-skip-permissions');
  assert.deepEqual(tokenizeCommand(agyCmd), ['agy', '--model', 'Gemini 3.1 Pro (High)', '--dangerously-skip-permissions']);
  assert.equal(quoteCommandToken('plain'), 'plain');
});

test('custom flags survive a relaunch / model update across providers via applyModelToCommandLine', () => {
  // 1) Codex with custom `-a never -s danger-full-access`:
  const dwightCmd = 'codex -a never -s danger-full-access';
  assert.equal(
    applyModelToCommandLine(dwightCmd, undefined, 'codex'),
    'codex -a never -s danger-full-access',
    'Restart & Continue with no model change preserves custom sandbox flags verbatim'
  );
  assert.equal(
    applyModelToCommandLine(dwightCmd, 'gpt-5.4', 'codex'),
    'codex --model gpt-5.4 -a never -s danger-full-access',
    'Switching model in-place keeps custom `-a never -s danger-full-access` flags'
  );
  assert.equal(
    applyModelToCommandLine('codex --model gpt-5.3-codex -a never -s danger-full-access', 'gpt-5.4', 'codex'),
    'codex --model gpt-5.4 -a never -s danger-full-access',
    'Changing an existing --model replaces only the model value and preserves custom flags'
  );
  assert.equal(
    applyModelToCommandLine('codex --model gpt-5.4 -a never -s danger-full-access', undefined, 'codex'),
    'codex -a never -s danger-full-access',
    'Clearing model removes --model while keeping custom flags'
  );

  // 2) Claude, Gemini, Antigravity custom flags survive too:
  assert.equal(
    applyModelToCommandLine('claude --permission-mode bypassPermissions --verbose', 'claude-opus-4-7', 'claude'),
    'claude --model claude-opus-4-7 --permission-mode bypassPermissions --verbose'
  );
  assert.equal(
    applyModelToCommandLine('gemini --approval-mode=yolo --sandbox=false', 'gemini-2.5-pro', 'gemini'),
    'gemini --model gemini-2.5-pro --approval-mode=yolo --sandbox=false'
  );
  assert.equal(
    applyModelToCommandLine('agy --model "Gemini 3.1 Pro (High)" --dangerously-skip-permissions', 'Claude Opus 4.6 (Thinking)', 'antigravity'),
    'agy --model "Claude Opus 4.6 (Thinking)" --dangerously-skip-permissions'
  );

  // 3) Short `-m` alias and trailing `--model` with no value are handled cleanly without swallowing neighboring flags:
  assert.equal(
    applyModelToCommandLine('codex -m gpt-5.3-codex -a never -s danger-full-access', 'gpt-5.4', 'codex'),
    'codex --model gpt-5.4 -a never -s danger-full-access'
  );
  assert.equal(
    applyModelToCommandLine('codex -a never -s danger-full-access --model', 'gpt-5.4', 'codex'),
    'codex -a never -s danger-full-access --model gpt-5.4'
  );
  assert.equal(
    applyModelToCommandLine('codex --model -a never -s danger-full-access', 'gpt-5.4', 'codex'),
    'codex --model gpt-5.4 -a never -s danger-full-access'
  );
});

test('provider default applies only when nothing was persisted (or when switching providers)', () => {
  const cfg = { defaultCommand: 'claude', autoMode: true };

  // Nothing persisted -> applyModelToCommandLine returns null -> caller falls back to buildSpawnCommand default:
  assert.equal(applyModelToCommandLine(undefined, undefined, 'codex'), null);
  assert.equal(applyModelToCommandLine('', undefined, 'codex'), null);
  const codexDefault = applyModelToCommandLine(undefined, undefined, 'codex')
    ?? buildSpawnCommand(cfg, undefined, 'codex');
  assert.equal(codexDefault, 'codex -a never -s workspace-write');

  // Switching provider (e.g. codex -> claude) invalidates the old provider's command -> falls back to new provider default:
  assert.equal(applyModelToCommandLine('codex -a never -s danger-full-access', 'claude-sonnet-4-6', 'claude'), null);
  const switched = applyModelToCommandLine('codex -a never -s danger-full-access', 'claude-sonnet-4-6', 'claude')
    ?? buildSpawnCommand(cfg, 'claude-sonnet-4-6', 'claude');
  assert.equal(switched, 'claude --model claude-sonnet-4-6 --permission-mode bypassPermissions');

  // buildWorkerLaunch: custom `-s danger-full-access` wins over autoMode's `-a never -s workspace-write`,
  // and `launch.command` preserves the full command string including `requestModel`:
  const customWorker = buildWorkerLaunch({
    requestCommand: 'codex -a never -s danger-full-access',
    requestModel: 'gpt-5.4',
    autoMode: true
  });
  assert.equal(customWorker.bin, 'codex');
  assert.deepEqual(customWorker.args, ['-a', 'never', '-s', 'danger-full-access', '--model', 'gpt-5.4']);
  assert.equal(customWorker.command, 'codex -a never -s danger-full-access --model gpt-5.4');

  // Bare worker with nothing custom gets the provider default (`-a never -s workspace-write`):
  const defaultWorker = buildWorkerLaunch({
    requestCommand: 'codex',
    autoMode: true
  });
  assert.deepEqual(defaultWorker.args, ['-a', 'never', '-s', 'workspace-write']);
  assert.equal(defaultWorker.command, 'codex -a never -s workspace-write');
});

test('HiveManager persists command in registry.json, preserves it across respawns, and loads old entries with no command', async () => {
  const { dir, hive, cleanup } = makeTempHive();
  try {
    hive.ensureHive();
    const regPath = path.join(dir, 'hive', 'registry.json');

    // 1) Seed an OLD registry entry with NO `command` field (like Dwight's pre-fix entry):
    const legacyReg = {
      orchestratorId: null,
      agents: {
        'worker-legacy': {
          id: 'worker-legacy',
          name: 'Legacy Worker',
          provider: 'codex',
          role: 'worker',
          capabilities: [],
          cwd: dir,
          status: 'idle',
          lastSeen: 1000,
          sessionId: '019legacy-session'
        }
      }
    };
    fs.writeFileSync(regPath, JSON.stringify(legacyReg, null, 2), 'utf8');

    // Old entry loads cleanly with `lastCommand() === undefined` and preserves sessionId:
    assert.equal(hive.lastCommand('worker-legacy'), undefined);
    assert.equal(hive.lastSession('worker-legacy'), '019legacy-session');
    await hive.ensureAgent({ id: 'worker-legacy', name: 'Legacy Worker', provider: 'codex', cwd: dir });
    assert.equal(hive.lastCommand('worker-legacy'), undefined, 'legacy entry without command stays undefined until given one');
    assert.equal(hive.lastSession('worker-legacy'), '019legacy-session', 'legacy entry keeps sessionId on respawn');

    // 2) Spawn Dwight with custom launch flags (`codex -a never -s danger-full-access`):
    await hive.ensureAgent({
      id: 'worker-hoacorpus',
      name: 'Dwight',
      provider: 'codex',
      command: 'codex -a never -s danger-full-access',
      role: 'worker',
      cwd: dir
    });
    assert.equal(hive.lastCommand('worker-hoacorpus'), 'codex -a never -s danger-full-access');
    assert.equal(
      hive.registry().agents['worker-hoacorpus'].command,
      'codex -a never -s danger-full-access'
    );

    // 3) Subsequent respawn that omits `meta.command` preserves the previously saved custom command:
    await hive.ensureAgent({
      id: 'worker-hoacorpus',
      name: 'Dwight',
      provider: 'codex',
      cwd: dir
    });
    assert.equal(
      hive.lastCommand('worker-hoacorpus'),
      'codex -a never -s danger-full-access',
      'respawning without meta.command preserves the saved custom command in registry.json'
    );

    // 4) `patchAgentCommand` updates the stored command in-place (used by EditAgentModal):
    const patched = hive.patchAgentCommand('worker-hoacorpus', 'codex --model gpt-5.4 -a never -s danger-full-access');
    assert.equal(patched.ok, true);
    assert.equal(
      hive.lastCommand('worker-hoacorpus'),
      'codex --model gpt-5.4 -a never -s danger-full-access'
    );
  } finally {
    cleanup();
  }
});

test('resume args combine cleanly with custom launch flags and hive injection args across providers', async () => {
  const { dir, hive, cleanup } = makeTempHive();
  try {
    // 1) Codex subcommand resume (`codex resume <sid> <custom flags> <hive args + positional prompt>`):
    const userArgs = ['-a', 'never', '-s', 'danger-full-access'];
    const inj = await hive.ensureAgent({
      id: 'worker-hoacorpus',
      name: 'Dwight',
      provider: 'codex',
      command: formatCommandLine('codex', userArgs),
      cwd: dir
    });
    const combinedBeforeResume = [...userArgs, ...inj.args];
    const codexResumed = applyResumeToArgs(combinedBeforeResume, 'codex', '019a1234-5678-7000-8000-abcdef123456');
    assert.equal(codexResumed.resumed, true);
    assert.equal(codexResumed.args[0], 'resume', 'codex resume subcommand is argv[0]');
    assert.equal(codexResumed.args[1], '019a1234-5678-7000-8000-abcdef123456', 'session id precedes positional prompt');
    assert.deepEqual(
      codexResumed.args.slice(2, 6),
      ['-a', 'never', '-s', 'danger-full-access'],
      'custom danger-full-access flags are preserved intact on codex resume'
    );
    assert.ok(
      !codexResumed.args.includes('workspace-write'),
      'workspace-write default is never injected when custom danger-full-access flags exist'
    );
    assert.ok(
      codexResumed.args.includes('--dangerously-bypass-hook-trust'),
      'hive codex hook-trust flag is still included'
    );
    assert.match(
      codexResumed.args[codexResumed.args.length - 1],
      /You are "Dwight" \(worker-hoacorpus\)/,
      'hive identity prompt remains the final positional argument'
    );
    // Idempotent if called twice:
    assert.deepEqual(
      applyResumeToArgs(codexResumed.args, 'codex', '019a1234-5678-7000-8000-abcdef123456').args,
      codexResumed.args
    );

    // 2) Flag-based providers (Claude `--resume`, Gemini `--resume`, Antigravity `--conversation`):
    const claudeResumed = applyResumeToArgs(
      ['--model', 'claude-opus-4-7', '--permission-mode', 'plan'],
      'claude',
      'sess-claude-1'
    );
    assert.equal(claudeResumed.resumed, true);
    assert.deepEqual(claudeResumed.args, [
      '--model', 'claude-opus-4-7', '--permission-mode', 'plan', '--resume', 'sess-claude-1'
    ]);

    const agyResumed = applyResumeToArgs(
      ['--model', 'Gemini 3.1 Pro (High)', '--dangerously-skip-permissions'],
      'antigravity',
      'conv-agy-99'
    );
    assert.equal(agyResumed.resumed, true);
    assert.deepEqual(agyResumed.args, [
      '--model', 'Gemini 3.1 Pro (High)', '--dangerously-skip-permissions', '--conversation', 'conv-agy-99'
    ]);

    const geminiResumed = applyResumeToArgs(
      ['--approval-mode=yolo', '--sandbox=false'],
      'gemini',
      'gem-sess-42'
    );
    assert.equal(geminiResumed.resumed, true);
    assert.deepEqual(geminiResumed.args, [
      '--approval-mode=yolo', '--sandbox=false', '--resume', 'gem-sess-42'
    ]);

    // 3) Provider auto-mode fallback still works when NO custom flags were persisted:
    const fallbackArgs = argsWithAutoModeFlag([], true, inferAgentProvider('codex'));
    assert.deepEqual(fallbackArgs, ['-a', 'never', '-s', 'workspace-write']);
  } finally {
    cleanup();
  }
});

test('resolveSpawnCommandAndFlags: explicit flagless wins over saved flags, bare relaunch uses saved flags, and flagless first spawn matches pre-PR autoMode behavior', () => {
  // 1) Explicit flagless command (`hive.command: "codex"`, `args: []`) vs saved-with-flags:
  //    Explicit MUST win — stale saved `-s danger-full-access` must not silently override it,
  //    and `persistedCommand` updates to `"codex"`.
  const explicitFlagless = resolveSpawnCommandAndFlags({
    command: 'codex',
    args: [],
    provider: 'codex',
    explicitMetaCommand: 'codex',
    savedCommand: 'codex -a never -s danger-full-access',
    autoMode: true
  });
  assert.equal(explicitFlagless.command, 'codex');
  assert.deepEqual(explicitFlagless.args, [], 'explicit flagless codex spawn keeps empty args (no stale saved flags or silent autoMode escalation)');
  assert.equal(explicitFlagless.persistedCommand, 'codex');

  // 2) Bare relaunch (`args: []`, no `explicitMetaCommand`) with a saved command in registry.json:
  //    Saved command (`codex -a never -s danger-full-access`) wins!
  const bareRelaunch = resolveSpawnCommandAndFlags({
    command: 'codex',
    args: [],
    provider: 'codex',
    explicitMetaCommand: undefined,
    savedCommand: 'codex -a never -s danger-full-access',
    autoMode: true
  });
  assert.equal(bareRelaunch.command, 'codex');
  assert.deepEqual(bareRelaunch.args, ['-a', 'never', '-s', 'danger-full-access'], 'bare relaunch restores saved custom flags');
  assert.equal(bareRelaunch.persistedCommand, 'codex -a never -s danger-full-access');

  // 3) Flagless first spawn (nothing saved in registry.json) with autoMode ON matches pre-PR behavior per provider:
  //    - Non-Claude providers (`codex`, `gemini`, `antigravity`) do NOT get silent autoMode flags in spawnAgentCore
  //      when launched flagless (`args` stays `[]`).
  //    - Claude gets `argsWithAutoModeFlag([], true, 'claude')` (`--permission-mode bypassPermissions`) in the Claude-only block.
  for (const nonClaude of ['codex', 'gemini', 'antigravity']) {
    const firstNonClaude = resolveSpawnCommandAndFlags({
      command: nonClaude,
      args: [],
      provider: nonClaude,
      explicitMetaCommand: nonClaude,
      savedCommand: undefined,
      autoMode: true
    });
    assert.deepEqual(firstNonClaude.args, [], `flagless ${nonClaude} spawn with autoMode on does not silently escalate in spawnAgentCore`);
    const bareFirstNonClaude = resolveSpawnCommandAndFlags({
      command: nonClaude,
      args: [],
      provider: nonClaude,
      explicitMetaCommand: undefined,
      savedCommand: undefined,
      autoMode: true
    });
    assert.deepEqual(bareFirstNonClaude.args, [], `bare first ${nonClaude} spawn with nothing saved keeps pre-PR args=[]`);
  }

  const bareFirstClaude = resolveSpawnCommandAndFlags({
    command: 'claude',
    args: [],
    provider: 'claude',
    explicitMetaCommand: undefined,
    savedCommand: undefined,
    autoMode: true
  });
  const claudeEffectiveArgs = argsWithAutoModeFlag(bareFirstClaude.args, true, 'claude');
  assert.deepEqual(claudeEffectiveArgs, ['--permission-mode', 'bypassPermissions'], 'Claude main-only spawn still receives bypassPermissions in the Claude block');
});

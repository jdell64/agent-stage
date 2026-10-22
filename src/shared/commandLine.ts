import { inferAgentProvider, providerPreset, type AgentProvider } from './agentProvider';

/** Split a command string into argv, respecting double/single quotes so a model
 *  value with spaces (agy's `--model "Gemini 3.1 Pro (High)"`) stays one token.
 *  Quotes are stripped from the result.
 *
 *  Shared because BOTH sides split command lines: the renderer's spawn flows
 *  (AddAgentModal, restore, command center) and main's orchestrator-hired-worker path
 *  (processSpawnRequest). They used to carry byte-identical copies, which is an
 *  invitation for the two to drift — and a worker whose command line splits
 *  differently from the renderer's is exactly the class of silent breakage the
 *  spawn-request fix exists to prevent. */
export function tokenizeCommand(command: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** Quote a single argv token when needed so `tokenizeCommand(formatCommandLine(tokens))`
 *  round-trips tokens containing spaces cleanly (e.g. `--model "Gemini 3.1 Pro (High)"`). */
export function quoteCommandToken(token: string): string {
  if (token === '') return '""';
  if (!/\s/.test(token)) return token;
  if (!token.includes('"')) return `"${token}"`;
  if (!token.includes("'")) return `'${token}'`;
  return `"${token.replace(/"/g, '')}"`;
}

/** Join an executable + argv into a normalized command line string. */
export function formatCommandLine(bin: string, args: string[] = []): string {
  const head = bin.trim();
  if (!head) return '';
  const tail = args.filter((a) => typeof a === 'string' && a.length > 0).map(quoteCommandToken);
  return [quoteCommandToken(head), ...tail].join(' ');
}

/** Update only the `--model` flag on an existing command line while keeping its
 *  executable and any custom launch flags (`-a never -s danger-full-access`, etc.)
 *  intact. Returns `null` when `existingCommand` is empty or belongs to a
 *  different provider (so the caller falls back to `buildSpawnCommand`). */
export function applyModelToCommandLine(
  existingCommand: string | undefined,
  model: string | undefined,
  provider: AgentProvider
): string | null {
  const raw = typeof existingCommand === 'string' ? existingCommand.trim() : '';
  if (!raw) return null;
  const existingProvider = inferAgentProvider(raw);
  if (existingProvider !== provider && provider !== 'custom') return null;

  const preset = providerPreset(provider);
  const tokens = tokenizeCommand(raw);
  if (tokens.length === 0) return null;
  const bin = tokens[0];
  const rest = tokens.slice(1);

  if (!preset.supportsModel || !preset.modelFlag) {
    return formatCommandLine(bin, rest);
  }

  const flag = preset.modelFlag;
  const shortFlag = flag === '--model' ? '-m' : null;
  const cleaned: string[] = [];
  let replaced = false;
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok === flag || (shortFlag && tok === shortFlag)) {
      const nextTok = rest[i + 1];
      // Only consume the next token if it looks like a model value rather than
      // another flag (so a trailing `--model` with no value or `--model -a never`
      // doesn't swallow `-a`).
      if (nextTok !== undefined && !nextTok.startsWith('-')) {
        i += 1;
      }
      if (model && !replaced) {
        cleaned.push(flag, model);
        replaced = true;
      }
      continue;
    }
    if (tok.startsWith(`${flag}=`) || (shortFlag && tok.startsWith(`${shortFlag}=`))) {
      if (model && !replaced) {
        cleaned.push(flag, model);
        replaced = true;
      }
      continue;
    }
    cleaned.push(tok);
  }

  if (model && !replaced) {
    cleaned.unshift(flag, model);
  }
  return formatCommandLine(bin, cleaned);
}

export interface ResolveSpawnCommandInput {
  command: string;
  args?: string[];
  provider: AgentProvider;
  explicitMetaCommand?: string;
  savedCommand?: string;
  autoMode: boolean;
}

export interface ResolvedSpawnCommand {
  command: string;
  args: string[];
  persistedCommand: string;
}

/** Resolve the executable, user launch flags (`args`), and durable `persistedCommand`
 *  for `spawnAgentCore` BEFORE per-spawn hive hook/prompt/resume args are injected:
 *  - An explicit command (`args.length > 0` or `explicitMetaCommand` provided, including
 *    an explicitly flagless command like `hive.command = "codex"` with `args = []`)
 *    ALWAYS wins over a stale `savedCommand` in `registry.json` and never silently
 *    escalates non-Claude flagless spawns with `autoMode` flags.
 *  - A bare relaunch (`!explicit`: `args` empty and no `explicitMetaCommand`) reuses
 *    `savedCommand` from `registry.json` when present for the same provider; only when
 *    nothing was saved does it fall back to the pre-PR provider default (Claude gets
 *    `argsWithAutoModeFlag` in the Claude block; non-Claude stays bare `[]`). */
export function resolveSpawnCommandAndFlags(input: ResolveSpawnCommandInput): ResolvedSpawnCommand {
  let command = input.command;
  let args = [...(input.args ?? [])];

  // 1) If a caller passed a full command string (`codex -a never -s danger-full-access`)
  //    without pre-splitting `args`, split it here so every entry point behaves identically.
  const cmdTokens = tokenizeCommand(command);
  if (cmdTokens.length > 1 && args.length === 0) {
    command = cmdTokens[0];
    args = cmdTokens.slice(1);
  } else if (cmdTokens.length === 1) {
    command = cmdTokens[0];
  }

  const explicitMetaCmd = typeof input.explicitMetaCommand === 'string' ? input.explicitMetaCommand.trim() : '';
  const savedCmd = typeof input.savedCommand === 'string' && input.savedCommand.trim()
    ? input.savedCommand.trim()
    : undefined;

  if (args.length === 0 && explicitMetaCmd) {
    const metaTokens = tokenizeCommand(explicitMetaCmd);
    if (metaTokens.length > 0 && inferAgentProvider(explicitMetaCmd, input.provider) === input.provider) {
      command = metaTokens[0];
      args = metaTokens.slice(1);
    }
  }

  const explicit = args.length > 0 || explicitMetaCmd.length > 0;
  if (!explicit && savedCmd && inferAgentProvider(savedCmd, input.provider) === input.provider) {
    const savedTokens = tokenizeCommand(savedCmd);
    if (savedTokens.length > 0) {
      command = savedTokens[0];
      args = savedTokens.slice(1);
    }
  }

  const persistedCommand = explicitMetaCmd
    || formatCommandLine(command, args)
    || savedCmd
    || command;

  return { command, args, persistedCommand };
}

/** Combine an argv list with session-resume arguments for the given provider.
 *  - Flag-based providers (`claude`, `gemini`, `grok`, `copilot`, `cursor`,
 *    `antigravity` `--conversation`, `crush`/`pi` `--session`) append `[resumeFlag, sessionId]`
 *    unless already present.
 *  - Subcommand-based providers (`codex`: `codex resume [OPTIONS] [SESSION_ID] [PROMPT]`)
 *    place the subcommand first, keep custom flags/options before the session id,
 *    and place `sessionId` immediately before any trailing positional prompt. */
export function applyResumeToArgs(
  args: string[],
  provider: AgentProvider,
  sessionId: string | undefined
): { args: string[]; resumed: boolean } {
  const sid = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (!sid) return { args, resumed: false };
  const preset = providerPreset(provider);
  if (preset.resumeFlag) {
    const rf = preset.resumeFlag;
    if (args.includes(rf)) return { args, resumed: true };
    return { args: [...args, rf, sid], resumed: true };
  }
  if (preset.resumeSubcommand) {
    const rsub = preset.resumeSubcommand;
    if (args[0] === rsub) return { args, resumed: true };
    return { args: [rsub, sid, ...args], resumed: true };
  }
  return { args, resumed: false };
}



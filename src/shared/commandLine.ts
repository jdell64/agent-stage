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
  const cleaned: string[] = [];
  let replaced = false;
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok === flag) {
      i += 1; // skip old model value
      if (model && !replaced) {
        cleaned.push(flag, model);
        replaced = true;
      }
      continue;
    }
    if (tok.startsWith(`${flag}=`)) {
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



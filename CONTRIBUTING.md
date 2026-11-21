# Contributing to Agent Stage

Contributions are welcome through pull requests. Keep them easy to review.

## Rules for pull requests

- Open a PR when the change is ready. You do not need permission first for a focused fix or improvement.
- One fix, improvement, or refactor per PR. Split unrelated work.
- Keep the diff small. Do not mix a behavior change with cleanup, formatting, or a broad rewrite unless all of it is necessary for that single change.
- Write a clear title and description that state what changed, why it changed, and how you verified it.
- Include screenshots or a short recording for visual changes. Show the same state before and after when that makes the result clearer.
- Add a test when it meaningfully protects changed behavior or a regression. Tests are not ceremony; they should earn their maintenance cost.

## Before opening a PR

1. Read your diff. Remove debug output, dead code, unrelated formatting, and generated files.
2. Run the relevant checks. For most code changes, start with:

   ```bash
   npm run typecheck
   npm run test:focused
   ```

3. For UI work, verify the running Electron app and include visual evidence.
4. For a behavior change, add or update a test when it provides useful regression coverage.
5. If you change design surfaces, use the tokens and conventions in [`DESIGN.md`](./DESIGN.md).

## Working in the repository

- Agent Stage supports macOS, Windows, and Linux. Use platform-safe paths and avoid shell assumptions.
- For parallel work on this Windows development host, create task worktrees under `C:/dev/worktrees/agent-stage/<task>` (for example, `C:/dev/worktrees/agent-stage/fix-taskbar-icon`) rather than inside the repository checkout. Keep the main checkout untouched.
- Quote paths and account for directories with spaces.
- Keep provider-specific behavior behind an explicit check. Shared behavior must remain provider-neutral.
- Do not assume another developer's files, credentials, processes, or shell are available.
- Do not commit credentials, tokens, customer data, `node_modules`, build output, or generated artifacts.

## Theme-pack boundary

- `resources/themes/` is the app's core and may contain only the original, theme-neutral `plain` fallback. The test `test/themes/plainPack.test.ts` enforces this packaging boundary.
- Do not copy or merge upstream Munder Difflin office-theme maps, sprites, cast, copy, or branding into `resources/themes/` or other core runtime paths. Keep theme-specific assets in a standalone pack and load them from the user's themes folder or the configurable `themesDir` setting (for example, a local themes checkout).
- TNG, office/Munder Difflin, DS9, Princess Bride, and other non-default themes are optional packs; the app must continue to work with only `plain` installed. Keep app logos and icons generic and theme-neutral.
- When syncing or merging upstream, preserve this boundary even if upstream adds theme assets or branding to its default app paths. Port behavior/code selectively; do not bring those assets into the core bundle.

## Development setup

```bash
git clone <your-fork-url> agent-stage
cd agent-stage
npm install
npm run dev
```

Agent Stage requires Node.js 18+ and a C/C++ toolchain for `node-pty`. If an Electron upgrade leaves `node-pty` with an ABI error, run `npm install` again.

## Assets and questions

Contributed art must be original or compatibly licensed, with attribution where needed. Do not add third-party theme packs or unlicensed assets to the repo.

Use a GitHub issue or discussion for questions that need coordination before a large change.

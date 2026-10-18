# GuppyOS Adoption Plan for Agent Stage

_Read-only analysis. No source code was modified. Generated 2026-10-17 from fetched git history._

Remotes analyzed:
- `origin`   = jdell64/agent-stage (this fork; theme work)
- `upstream` = HarnessMD/munder-difflin (`main`)
- `guppyos`  = Prozzta/guppyos (default branch `release-1.1.90`)

`git fetch guppyos` and `git fetch upstream` both **succeeded** (no network/auth limitation). The working tree was left untouched on its current branch.

---

## Executive summary / recommendation

**Cherry-pick (port) GuppyOS's fixes into this fork. Do _not_ rebase this fork onto GuppyOS.**

The decision is driven by how little this fork has diverged from upstream versus how far GuppyOS has gone, and by where each side's changes land:

| Measurement (src/ only) | Files | Insertions / deletions |
|---|---|---|
| Owner's real app delta (`upstream/main` → `HEAD` = `6947527b`) | 125 | +5,620 / −2,253 |
| Upstream app drift GuppyOS never took (`merge-base` → `upstream/main`) | 124 | +11,750 / −2,255 |
| GuppyOS app drift (`merge-base` → `guppyos/release-1.1.90`) | 354 | +66,222 / −3,644 |

(Of the owner's 5,620 lines, roughly a third is the already-ported GuppyOS perf block `7993d1aa` — see below; the rest is theme/scene/cast/i18n/naming.)

The common ancestor of all three is `1f6958b0` ("Merge origin/main into integration/v0.4.5", **2026-08-22**).

Why cherry-pick-into-ours wins:

1. **The owner's fork is tiny and almost purely theme/naming work.** The 58 owner commits beyond upstream are nearly all `feat(theme*)`, `feat(scene)`, `feat(cast)`, `feat(tng)`, i18n, onboarding, and de-literalizing the orchestrator name (was "god"). Total app delta is ~2k lines across 32 files. This is cheap to keep and hard to justify replaying through a foreign tree.
2. **GuppyOS carries its own competing theme system and a different rebrand.** GuppyOS has `src/renderer/src/scene/themes/` and `graphicsProbe.ts` (neither exists here), a TES "theme-pack-as-project-theme" system that edits the exact files the owner owns (`OfficeThemePicker`, `scene/office/**`, cast/portraits — 26 commits touch `scene/office/`, 3 touch `OfficeThemePicker`), still calls the orchestrator **"god"**, and rebranded the app to **"Guppy"** (the owner rebranded to **"Agent Stage"**). Rebasing the owner's theme commits onto GuppyOS means fighting all of that head-on in the worst possible collision zone.
3. **Rebasing onto GuppyOS would also drop upstream's ~11,750-line post-Aug-22 app drift** that this fork currently sits on and that GuppyOS branched away from.
4. **Cherry-picking lets the owner take only the high-value runtime fixes** — which are overwhelmingly `src/main/**` (engine) code with little or no theme overlap — at a controlled, per-feature pace.

**Important caveat on effort:** these are **ports, not clean `git cherry-pick`s.** `src/main/hive.ts` is 3,754 lines here vs **6,174** in GuppyOS, and the two trees use different names ("god"/"Guppy" vs "orchestrator"/"Agent Stage"). Every item below is a multi-commit _series_ (Mail ≈ 63 commits, heavy-lock ≈ 70, idle ≈ 7) that must be re-applied and re-tested by hand, with naming reconciled. Treat each row's "effort" as porting the feature, not landing one SHA.

**Every item overlaps the owner-edited hub files.** The owner's perf integration (`7993d1aa`) and theme-IPC wiring already touched `src/main/{hive,index,config,hooks}.ts`, `src/preload/index.ts`, and `src/renderer/src/store/config.ts` — and _every_ GuppyOS feature series below also edits those same hub files. So no item ports in totally clean; each carries unavoidable textual merge work in the hubs. That is manageable (the hubs aren't theme code) but it is why "Low" effort is still real work. **Strict theme/scene collision** (the owner's `scene/office/**`, `OfficeThemePicker`, `themeRegistry`/`themePack`/`themeLoader`, cast/portraits, `main/themes.ts`) is narrower: only **#10 and #11** hit it, both via `src/renderer/src/scene/office/OfficeFloor.tsx`.

**Already partially in this fork (verified via `git show --stat`):**
- `7993d1aa feat(perf)` already landed GuppyOS's **standup-delta** (`standupDelta.ts`, 341 L), a **startup token** (`godStartup.ts`), **mail wake classification** (`mailWakeClass.ts`), token weights, and **memory-leak protection** in `memory.ts`. This partially covers #3 (standup suppression), #2 (wake classification), and possibly #6 (memory leak). It does **not** include the ZT-I4 "standup off / heartbeat retired" change itself.
- `9e28e5a9` already **mounted the ask board onto the office wall** (edits `scene/office/OfficeFloor.tsx`) and rebranded settings — so #7 (CARDS tab) must be reconciled against the owner's in-scene ask board, raising its conflict.
- `55c3f827 feat(standup): poll a user-configured provider-usage endpoint` is **owner-only** (not in upstream) and is the owner's **own** usage-header implementation (`usageEndpoint.ts` + `SettingsModal`), wired through the standup path. This makes #4 **largely redundant**, and means #3 (standups off) must not break the owner's usage-polling host.

All other feature files below are **absent** from this tree.

---

## Divergence magnitude

- `HEAD … guppyos/release-1.1.90` = **578 ahead / 1257 behind** — but this is misleading: of the 578, **505** are upstream commits GuppyOS never took and only **73** are reachable only from this fork. (`HEAD … upstream/main` = 73 / 0; `upstream/main … guppyos` = 505 / 1257.)
- Owner commits beyond upstream reachable from HEAD: **73** (58 on `origin/main` plus ~15 more only on HEAD, including the Agent Stage rebrand `2b785f82`, theme-cast/bridge-seating `12b1d912`, the perf block `7993d1aa`, and the ask-board-on-wall `9e28e5a9`). Nearly all theme/scene/cast/i18n/naming plus the one already-ported perf block.
- Owner app delta vs upstream (src/): **125 files, +5,620 / −2,253** — small next to GuppyOS's **354 files, +66,222**. This asymmetry is the core reason to pull _from_ GuppyOS rather than replay _onto_ it.

---

## Per-item table

Two conflict signals, both measured by intersecting each item's **full commit series** against the 125 files the owner actually changed (committed vs upstream + uncommitted):
- **T = strict theme/scene collision** (`scene/office/**`, `OfficeThemePicker`, `themeRegistry`/`themePack`/`themeLoader`, cast/characters/portraitArt, `main/themes.ts`).
- **U = owner-UI/hub overlap** (owner-edited renderer components and the hub files `hive/index/config/hooks/preload`, which _every_ item touches).

"Area" names a representative anchor commit; most items are a larger series.

| # | Item | GuppyOS anchor commit(s) / area | Effort | Risk | Conflict (T = theme/scene, U = UI/hub) | Adopt? |
|---|---|---|---|---|---|---|
| 1 | Reinvented Mail (messaging/inbox) | `86981c2e` ZT-I1-MAIL slice 1 (new `src/main/mailLedger.ts` ~1037 L) + slices 2–7 + boot migration `3966c6bb` + `MAIL-CHANNEL-STUCK-DEGRADED` fixes (`d8e5678e`,`cddf4d04`). ~63-commit series. | High | High (core runtime) | T: none. U: hubs + `CommandCenterPanel`, `useHive`, `store` | Yes — as a foundational block |
| 2 | Changed wakeups | native-wakeup + decision-only wake (`c64a458e`) + inbox-wake; intertwined with hive.ts & mail. (Wake _classification_ already partly here via `7993d1aa`.) | Med-High | Med | T: none. U: hubs + `CommandCenterPanel`, `useHive`, `store`, `standupDelta` | Yes — with the mail block |
| 3 | Removed stand-ups | `c64a458e` (standup off, heartbeat retired) + TE0 series (`87659822`,`dd1bfbea`) + `boardStatus.ts`, `floorDigest.ts`. (`standupDelta.ts` already here.) | Med | Med | T: none. U: hubs + `SettingsHeroCard`, `UpdateToast`, `useHive` | Yes — but see dependency: owner's usage-header (`55c3f827`) is wired through standup; do not break it |
| 4 | Subscription usage header | "Capacity display unit" series `e743b84d` (+14). `AgentUsageLine.tsx`, `capacityAgentUsage.ts` | Med | Low-Med | T: none. U: hubs + `AgentCard`, `AgentStrip`, `CommandCenterPanel`, `SettingsModal`, `App` | **Likely skip** — owner already built an equivalent usage header (`55c3f827`); adopt only to replace it |
| 5 | Fixed condensing / compaction | `c2eec1c4` READS-AUTOCOMPACT-ROLLOUT + `src/shared/autoCompactWindow.ts` + `f8f706ae` Condensation | Low-Med | Low | T: none. U: hubs + `reflect.ts` only (no owner UI components) | **Yes — quick win** |
| 6 | Fixed git-commit memory bloat | **Uncertain mapping** (no commit names "git commit"): best guess = `memoryRollover.ts` rollover series (`02bfc587`,`ef84fb6f`) + codex-bloat tool-output cap `87bc1705`; memory-leak protection in `memory.ts` is **already here** via `7993d1aa`. Alt candidate: `8cf4fe3b` codex `--no-daemon` (no git/GCM window). | Low-Med | Low | T: none. U: hubs + `SettingsModal` | Confirm mapping with GuppyOS devs first |
| 7 | Changed the "ask me" board | CARDS-TAB-190: `6b143c06`,`0278ca8d`,`cbbbefc6`. `CardsView.tsx`, `TasksKanban.tsx`, `CommandCenterPanel.tsx` | Med | Low | T: none, **but** owner mounted the ask board into the scene (`9e28e5a9` edits `OfficeFloor.tsx`). U: `CommandCenterPanel`, `TasksKanban`, `TaskDetailOverlay`, `store` | Yes — reconcile against the owner's in-scene ask board |
| 8 | Stopped antivirus slowdown | `b8017b61` LOG-STALL-AV + `672311a6` PERF-153-FINAL. `appendLog.ts`, `wakeRowPolicy.ts`, `costLifetime.ts` | Low-Med | Low | T: none. U: hubs + `SetupPanel`, `memory.ts` | **Yes — quick win** |
| 9 | Changed memory search | Large subsystem: `593de213` NATIVE-MEMORY-ENGINE + MEMPALACE-REMOVAL series (`b1e81fa3`,`d83fa8bb`,`f80c985c`,`94cdbf7c`) + warm-vector fixes. New `src/main/nativeMemory/` (absent here), onnxruntime-node + SQLite FTS5/sqlite-vec, packaging (asarUnpack/afterPack) | **Very High** | High | T: none. U: broad — `MemoryPanel`, `SettingsModal`, `OnboardingWizard`, `SetupPanel`, `CommandCenterPanel`, `useHive` | Defer / likely skip unless needed |
| 10 | Heavy-job lock | `3a82123d` HEAVY-JOB-SERIALIZE (new `src/main/heavyJob.ts`) + heavy-lock-shapes series (~70 commits). `hooks.ts`, `index.ts`, `SettingsModal.tsx` | Med | Low-Med | **T: yes** — series edits `scene/office/OfficeFloor.tsx` (floor reads the heavy-lock). U: `SettingsModal`, `MessageQueueComposer`, `store` | **Yes — high value**; careful OfficeFloor merge |
| 11 | Idle/working states reliable | IDLE-MEANS-IDLE-187 (`480b6f63`,`feffe902`) + `a670c0c5` CARD-IDLE-WHILE-WORKING + FLEET-LIVENESS (`80b27e67`) + PANEL-BLINK-188. Depends on ZT-I3 liveness subscription (`1e91eaae`) | Med-High | Med | **T: yes** — `a670c0c5` edits `scene/office/OfficeFloor.tsx`. U: `AgentCard`, `AgentDetailPanel`, `store` | Yes — careful scene merge; coordinate with theme work |
| 12 | Refresh models + auto-update in app | `99b659bb` "Refresh models" (new `providerModels.ts`, `ModelsRefreshPanel.tsx`) + `246faac7` CLAUDE-MODEL-LIST-STALE. ("auto-update in app" is not a distinct commit — covered by refresh + stale-list.) | Med | Low | T: none. U: hubs + `App`, `AddAgentModal`, `EditAgentModal`, `CommandCenterPanel`, `SettingsModal` | Yes |
| 13 | Persist model set in terminal | MODEL-PINBACK `cea47f1c` (+`fa74b3d6`) "in-TUI /model switches pin back" + model-persist-148 `3b967520` + `a9f9f362` AGENT-MODEL-NOT-KEPT (model+effort survive restart). New `src/shared/modelPin.ts` | Med (hive.ts divergent) | Low-Med | T: none. U: hubs + `AgentDetailPanel`, `CommandCenterPanel`, `EditAgentModal`, `useHive`, `store` | **Yes — high value** |

---

## Cross-cutting conflicts (apply under either option, every ported feature)

- **Naming:** GuppyOS still says **"god"**; this fork renamed it to **orchestrator** (`76c5a0f1`) and de-literalized the name across prompts, i18n, voice tools, and UI. Every ported commit that touches prompts/strings must be re-worded.
- **Branding:** GuppyOS rebranded to **"Guppy"** (`99a26c81`, `5ed430f1`); this fork is **"Agent Stage"** (`2b785f82`). Ported UI strings/paths must be rebranded.
- **Uncommitted / unmerged theme work to preserve:** the working tree currently has uncommitted edits to `OfficeThemePicker.tsx`, `scene/office/Character.ts`, `scene/office/ThoughtBubble.ts`, and the `i18n` locales, plus local `agent/worker-*` theme branches. Land/commit these before starting ports so the scene/office collision (item 11) is resolved against a known state.

---

## Recommended ordered adoption plan

No item is truly zero-overlap (every series edits the owner-touched hub files), so this orders by _smallest surface + no strict theme/scene collision_ first; the two `OfficeFloor`-touching items and the mail block come later.

1. **#5 Fixed condensing** — smallest surface: `src/main`/`src/shared` + `reflect.ts`, no owner UI components, no scene. Easy confidence-builder.
2. **#8 Antivirus / log-stall fix** — `src/main` + `SetupPanel`; direct perf/stability win, no scene collision.
3. **#13 Persist model when set in terminal** — `src/main`/`src/shared` + a couple of panels; no scene collision; clear UX win.
4. **#12 Refresh models (+ stale-list fix)** — renderer picker touch points but no scene; moderate value.
5. **#6 Git-commit memory bloat** — **first confirm the mapping** with the GuppyOS devs (memory-leak protection is already partly here via `7993d1aa`); small once confirmed.
6. **#7 Ask-me board (CARDS tab)** — reconcile against the owner's **in-scene** ask board (`9e28e5a9` put it on the office wall), then re-skin to the theme.
7. **Mail block together: #1 Reinvented Mail → #2 wakeups → #3 remove stand-ups.** Do as one coordinated effort; #2/#3 depend on the mail ledger / floor digest. Highest runtime risk — port with its tests and run them. **Guard the owner's usage header:** `55c3f827` is wired through the standup path, so verify it still works after #3 turns standups off.
8. **#10 Heavy-job lock** — high value (stops all agents launching test runs at once), but its series edits `scene/office/OfficeFloor.tsx`; merge carefully and re-verify the floor renders.
9. **#11 Idle/working states** — port after the mail/liveness infra exists (depends on the ZT-I3 liveness subscription). Also edits `scene/office/OfficeFloor.tsx`; merge against the owner's committed theme work and re-verify the floor.
10. **#4 Subscription usage header** — **likely skip**; the owner already has an equivalent (`55c3f827`). Adopt only if they prefer GuppyOS's Capacity-display implementation, in which case it replaces, not augments, the existing one.
11. **#9 Memory search** — largest single lift by far (new native-memory engine, bundled ONNX/SQLite, packaging changes). Defer; adopt only if the search quality is actually wanted, and budget it as its own project.

**Net:** keep this fork's upstream lineage and lightweight theme layer; pull GuppyOS value in as a prioritized series of ports, front-loading the engine-centric fixes and leaving the two `OfficeFloor`-touching items (#10, #11) for a careful merge against the owner's theme work.

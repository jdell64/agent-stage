# Enterprise Readiness & Upstream Decoupling Plan (`chore/enterprise-cleanup`)

**Worktree**: `C:\dev\agent-stage\.worktrees\enterprise-cleanup`
**Branch**: `chore/enterprise-cleanup` (based on `origin/main` `c2b70021`)

---

## Goal
1. **Zero Outbound Telemetry / Phone-Home**: Completely remove PostHog (`posthog-node`, `src/main/analytics.ts`, `TELEMETRY.md`, build-time `POSTHOG_KEY`/`POSTHOG_HOST`, and UI toggles for "Share anonymous usage stats") so enterprise security audits have zero heartburn.
   - *Important*: Keep `src/main/telemetry.ts` (the local `127.0.0.1` loopback OpenTelemetry collector that reads Claude Code token/span metrics locally for the UI and circuit breaker).
2. **Disable Remote `hero.json` Fetch**: Stop `src/main/hero.ts` from fetching `https://raw.githubusercontent.com/jdell64/agent-stage/main/docs/hero.json` on launch; always return `DEFAULT_HERO` locally without network requests. Remove `docs/hero.json`.
3. **Remove Upstream Marketing, Blog, Pricing, SEO & Razorpay Bloat**:
   - Remove directories:
     - `blog/`
     - `seo/`
     - `landing-remotion/`
     - `tools/landing-story/`
     - `tools/landing-halloween/`
     - `.agents/skills/ian-xiaohei-illustrations/`
     - `docs/pro/`, `docs/r/`, `docs/drops/`, `docs/hires/` (marketing/site assets)
   - Remove marketing/pricing/Razorpay files in `docs/` & `tools/`:
     - `docs/CNAME`, `docs/index.html`, `docs/pricing.html`, `docs/refund.html`, `docs/contact.html`, `docs/privacy.html`, `docs/terms.html`, `docs/wall.html`, `docs/wall-data.json`, `docs/download.html`, `docs/preview.html`, `docs/preview.css`, `docs/pam-tokens.css`, `docs/sitemap.xml`, `docs/robots.txt`, `docs/llms.txt`, `docs/llms-full.txt`, `docs/google4a7296cf44463a52.html`, `docs/harness-engineering-deck.html`, `docs/badge-github-trending.*`, `docs/hero.json`
     - `tools/make-ph-gallery-1.cjs`, `tools/make-ph-thumbnail.cjs`, `tools/ph-gallery-1.html`, `tools/check-release-links.cjs`
   - Remove upstream-specific GitHub files & workflows:
     - `.github/FUNDING.yml` (Razorpay link)
     - `.github/CODEOWNERS` (`@chaitanyagiri`)
     - `.github/workflows/blog.yml`
     - `.github/workflows/contributor-role.yml` (upstream Discord bot)
     - `.github/workflows/contributors.yml` & `scripts/generate-contributors.mjs`
     - `.github/workflows/pr-evidence.yml` (upstream fork gate linking to `chaitanyagiri/munder-difflin`)
4. **Clean Up Upstream URLs & Artifact Names in App Code**:
   - Remove `OSS_BLOG_LINKS` (`https://munderdiffl.in/blog/...`) from `src/shared/ossModels.ts`, `src/renderer/src/components/AddAgentModal.tsx`, and `src/renderer/src/components/AiEnginesSettings.tsx`.
   - Fix `electron-builder.yml` artifact names (`Agent-Stage-${version}-...` instead of `Munder-Difflin-${version}-...`) so they match `src/shared/updateState.ts`.
   - Update `User-Agent` in `src/main/updater.ts` from `munder-difflin-updater` to `agent-stage-updater`.
5. **Prevent Upstream Bloat from Returning (`scripts/sync-upstream.mjs` + `.gitattributes` + CI check)**:
   - Add `scripts/sync-upstream.mjs` (`npm run sync:upstream`) that fetches `upstream/main` and merges with `--no-commit`, automatically stripping excluded upstream paths (`blog/`, `seo/`, `landing-remotion/`, `tools/landing-*`, `.agents/skills/ian-xiaohei-illustrations/`, `docs/*.html`, `docs/CNAME`, `.github/FUNDING.yml`, `.github/workflows/blog.yml`, `src/main/analytics.ts`, `TELEMETRY.md`) before committing.
   - Add an enterprise/upstream hygiene check in `tools/check-enterprise-clean.cjs` (wired into `npm run check:links` / `.github/workflows/ci.yml`) that fails if `posthog`, `analytics.ts`, `blog/`, `seo/`, `docs/pricing.html`, or `docs/CNAME` reappear.

---

## Step-by-Step Checklist

- [x] **Step 1**: Create worktree `C:\dev\agent-stage\.worktrees\enterprise-cleanup` on branch `chore/enterprise-cleanup` and save this plan to `ENTERPRISE_CLEANUP_PLAN.md`.
- [x] **Step 2**: Strip PostHog & outbound analytics:
  - Delete `src/main/analytics.ts`, `TELEMETRY.md`, `test/telemetry-funnel.test.cjs`, `test/telemetry-message-count.test.cjs`, `test/update-applied.test.cjs`.
  - Remove `posthog-node` from `package.json`.
  - Remove `__POSTHOG_KEY__` and `__POSTHOG_HOST__` from `electron.vite.config.ts` and `.github/workflows/release.yml`.
  - Remove `analytics.*` calls and `analytics:messageSent` IPC from `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/components/MessageQueueComposer.tsx`, `src/renderer/src/components/terminalPool.ts`.
  - Remove `telemetryEnabled` UI toggle from `src/renderer/src/components/OnboardingWizard.tsx` and `src/renderer/src/components/SettingsModal.tsx` (and `src/main/config.ts` / `src/preload/index.ts` / `src/renderer/src/store/config.ts`).
- [x] **Step 3**: Disable remote `hero.json`:
  - Update `src/main/hero.ts` so `loadHero()` immediately returns `{ hero: DEFAULT_HERO, fetchedAt: Date.now(), stale: false }` with zero network requests.
  - Delete `docs/hero.json` and update `test/hero-payload.test.cjs` to verify `loadHero()` locally.
- [x] **Step 4**: Remove `OSS_BLOG_LINKS` (`munderdiffl.in/blog/...`) and fix updater/builder branding:
  - Remove `OSS_BLOG_LINKS` from `src/shared/ossModels.ts`, `src/renderer/src/components/AddAgentModal.tsx`, and `src/renderer/src/components/AiEnginesSettings.tsx`.
  - Update `electron-builder.yml` `artifactName` entries from `Munder-Difflin-${version}-...` to `Agent-Stage-${version}-...`.
  - Update `src/main/updater.ts` `User-Agent` to `agent-stage-updater`.
- [x] **Step 5**: Delete upstream marketing/blog/SEO/pricing folders and workflows:
  - Delete `blog/`, `seo/`, `landing-remotion/`, `tools/landing-story/`, `tools/landing-halloween/`, `.agents/skills/ian-xiaohei-illustrations/`, `tools/make-ph-*.cjs`, `tools/ph-gallery-1.html`.
  - Delete marketing files in `docs/` (keeping architecture/technical docs like `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/model-catalog.json`, `docs/theming/`, `docs/research/`, `docs/design/`, and `docs/logo.png`).
  - Delete `.github/FUNDING.yml`, `.github/CODEOWNERS`, `.github/workflows/blog.yml`, `.github/workflows/contributor-role.yml`, `.github/workflows/contributors.yml`, `.github/workflows/pr-evidence.yml`, `scripts/generate-contributors.mjs`.
  - Update `.github/workflows/ci.yml` and `package.json` scripts.
- [x] **Step 6**: Add `scripts/sync-upstream.mjs` + `tools/check-enterprise-clean.cjs`.
- [x] **Step 7**: Run validation (`npm run typecheck`, `npm run build`, `node tools/check-enterprise-clean.cjs`, and unit tests), commit, push `chore/enterprise-cleanup`, and open PR against `jdell64/agent-stage` `main`.

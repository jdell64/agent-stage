#!/usr/bin/env node
/**
 * Upstream Sync Filter (`npm run sync:upstream`)
 *
 * Fetches `upstream/main` (if the `upstream` remote is configured) or cleans the
 * current working tree after an upstream merge/cherry-pick by automatically
 * removing upstream-only marketing, blog, SEO, pricing, and PostHog telemetry paths.
 *
 * Usage:
 *   node scripts/sync-upstream.mjs            # strip excluded upstream paths in-place
 *   node scripts/sync-upstream.mjs --merge    # git fetch upstream && git merge --no-commit upstream/main && strip
 */

import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const UPSTREAM_EXCLUDED_PATHS = [
  'src/main/analytics.ts',
  'TELEMETRY.md',
  'test/telemetry-funnel.test.cjs',
  'test/telemetry-message-count.test.cjs',
  'test/update-applied.test.cjs',
  'docs/hero.json',
  'docs/CNAME',
  'docs/index.html',
  'docs/pricing.html',
  'docs/refund.html',
  'docs/contact.html',
  'docs/privacy.html',
  'docs/terms.html',
  'docs/wall.html',
  'docs/wall-data.json',
  'docs/download.html',
  'docs/preview.html',
  'docs/preview.css',
  'docs/pam-tokens.css',
  'docs/sitemap.xml',
  'docs/robots.txt',
  'docs/llms.txt',
  'docs/llms-full.txt',
  'docs/google4a7296cf44463a52.html',
  'docs/harness-engineering-deck.html',
  'docs/badge-github-trending.png',
  'docs/badge-github-trending.svg',
  'docs/pro',
  'docs/r',
  'docs/drops',
  'docs/hires',
  'docs/blog',
  'blog',
  'seo',
  'landing-remotion',
  'tools/landing-story',
  'tools/landing-halloween',
  'tools/make-ph-gallery-1.cjs',
  'tools/make-ph-thumbnail.cjs',
  'tools/ph-gallery-1.html',
  'tools/check-release-links.cjs',
  '.agents/skills/ian-xiaohei-illustrations',
  '.github/FUNDING.yml',
  '.github/CODEOWNERS',
  '.github/workflows/blog.yml',
  '.github/workflows/contributor-role.yml',
  '.github/workflows/contributors.yml',
  '.github/workflows/pr-evidence.yml',
  'scripts/generate-contributors.mjs'
];

const args = process.argv.slice(2);
if (args.includes('--merge')) {
  const ref = args.find((a) => !a.startsWith('--')) || 'upstream/main';
  console.log(`Fetching and merging ${ref} (--no-commit)...`);
  execSync('git fetch upstream', { cwd: ROOT, stdio: 'inherit' });
  try {
    execSync(`git merge --no-commit --no-ff ${ref}`, { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.log('Merge produced conflicts; stripping excluded upstream paths first...');
  }
}

let removed = 0;
for (const rel of UPSTREAM_EXCLUDED_PATHS) {
  const full = resolve(ROOT, rel);
  if (existsSync(full)) {
    try {
      execSync(`git rm -rf --ignore-unmatch "${rel}"`, { cwd: ROOT, stdio: 'ignore' });
    } catch {
      // Fallback to fs removal if git rm fails during unmerged state
    }
    if (existsSync(full)) {
      rmSync(full, { recursive: true, force: true });
    }
    console.log(`Removed excluded upstream path: ${rel}`);
    removed++;
  }
}

console.log(`Upstream filter complete (${removed} excluded path(s) removed).`);

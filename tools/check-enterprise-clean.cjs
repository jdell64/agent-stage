#!/usr/bin/env node
'use strict';

/**
 * Enterprise Cleanliness & Upstream Hygiene Gate
 *
 * Ensures that:
 * 1. Outbound product analytics (PostHog, src/main/analytics.ts, TELEMETRY.md) are absent.
 * 2. Remote hero.json fetching is disabled.
 * 3. Upstream marketing/blog/pricing/SEO folders and files (blog/, seo/, landing-remotion/,
 *    docs/pricing.html, docs/CNAME, etc.) have not been reintroduced during an upstream sync.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const FORBIDDEN_PATHS = [
  'src/main/analytics.ts',
  'TELEMETRY.md',
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
  'docs/pro',
  'docs/r',
  'docs/drops',
  'docs/hires',
  'blog',
  'seo',
  'landing-remotion',
  'tools/landing-story',
  'tools/landing-halloween',
  '.agents/skills/ian-xiaohei-illustrations',
  '.github/FUNDING.yml',
  '.github/CODEOWNERS',
  '.github/workflows/blog.yml',
  '.github/workflows/contributor-role.yml',
  '.github/workflows/contributors.yml',
  '.github/workflows/pr-evidence.yml',
  'scripts/generate-contributors.mjs'
];

const errors = [];

for (const rel of FORBIDDEN_PATHS) {
  if (fs.existsSync(path.join(ROOT, rel))) {
    errors.push(`Forbidden upstream/telemetry path exists: ${rel}`);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (pkg.dependencies?.['posthog-node'] || pkg.devDependencies?.['posthog-node']) {
  errors.push('posthog-node must not be present in package.json dependencies');
}

const heroTs = fs.readFileSync(path.join(ROOT, 'src/main/hero.ts'), 'utf8');
if (/https?:\/\/munderdiffl\.in\/hero\.json/.test(heroTs) || /httpsRequest/.test(heroTs)) {
  errors.push('src/main/hero.ts must not make remote HTTP requests to munderdiffl.in/hero.json');
}

if (errors.length > 0) {
  console.error('Enterprise clean check failed:');
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log('Enterprise clean check passed.');

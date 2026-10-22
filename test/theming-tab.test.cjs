'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('SettingsModal has Theming tab positioned right under General', () => {
  const modal = read('src/renderer/src/components/SettingsModal.tsx');

  // Verify Section type includes 'Theming'
  assert.match(modal, /export type Section = 'General' \| 'Theming' \|/);

  // Verify NAV_SECTIONS has 'Theming' right after 'General'
  assert.match(modal, /NAV_SECTIONS: Section\[\] = \['General', 'Theming',/);

  // Verify NAV_SECTION_KEYS maps 'Theming'
  assert.match(modal, /'Theming': 'settings\.nav\.theming'/);

  // Verify OfficeThemePicker is rendered in Theming section
  assert.match(modal, /\{activeSection === 'Theming' && \(\s*<OfficeThemePicker config=\{config\} \/>\s*\)\}/);

  // Verify OfficeThemePicker is only in Theming section (exactly 1 occurrence)
  const matches = modal.match(/<OfficeThemePicker/g) ?? [];
  assert.equal(matches.length, 1);
});

test('i18n locales declare settings.nav.theming', () => {
  for (const lang of ['en.json', 'ar.json', 'zh-CN.json']) {
    const json = JSON.parse(read(`src/renderer/src/i18n/locales/${lang}`));
    assert.ok(json.settings?.nav?.theming, `${lang} missing settings.nav.theming`);
  }
});

test('SpritePortrait calculates bust framing based on aspect ratio', () => {
  const portrait = read('src/renderer/src/components/SpritePortrait.tsx');

  // Must calculate targetRatio and currentRatio
  assert.match(portrait, /const targetRatio = FRAME_W \/ FRAME_H;/);
  assert.match(portrait, /const currentRatio = bw \/ bh;/);

  // Must scale using computed source rect (sx, sy, sw, sh)
  assert.match(portrait, /ctx\.drawImage\(bust, sx, sy, sw, sh, 0, 0, FRAME_W \* scale, FRAME_H \* scale\);/);
});

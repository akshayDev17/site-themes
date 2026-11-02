import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONTRAST_RULES, checkContrast, contrastRatio, parseHex } from '../src/contrast.js';
import { BASE_THEME_ID, SYSTEM_THEMES, THEMES, type Theme } from '../src/themes.js';

test('contrast ratio matches known values', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
  assert.equal(contrastRatio('#fff', '#ffffff'), 1);
  // Report section 2.7: ink on paper 16.47, card-line on paper 3.06.
  assert.equal(contrastRatio('#0F1220', '#EEF1F8').toFixed(2), '16.47');
  assert.equal(contrastRatio('#818A9F', '#EEF1F8').toFixed(2), '3.06');
  assert.throws(() => parseHex('red'));
});

test('thresholds are exactly report section 3.5.5', () => {
  assert.deepEqual(CONTRAST_RULES, [
    { fg: ['text', 'textBody', 'textMuted'], bg: ['surface', 'surface2', 'card'], min: 4.5 },
    { fg: ['accent'], bg: ['surface', 'surface2', 'card'], min: 4.5 },
    { fg: ['cardLine'], bg: ['surface', 'card'], min: 3 },
    { fg: ['focus'], bg: ['surface', 'surface2', 'card'], min: 3 },
  ]);
});

test('every catalogue theme passes the gate', () => {
  const failures = checkContrast(THEMES).filter((r) => !r.pass);
  assert.deepEqual(failures, []);
});

test('a theme below threshold is caught', () => {
  const bad: Theme = { ...THEMES[0], id: 'bad', color: { ...THEMES[0].color, textMuted: '#9AA0AE' } };
  const failures = checkContrast([bad]).filter((r) => !r.pass);
  assert.ok(failures.length > 0);
  assert.ok(failures.every((r) => r.fg === 'textMuted'));
});

test('catalogue: unique ids, hex colours, System slots exist with matching schemes', () => {
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
  for (const t of THEMES) {
    for (const [role, value] of Object.entries(t.color)) assert.match(value, /^#[0-9A-F]{6}$/, `${t.id}.${role}`);
  }
  assert.equal(THEMES.find((t) => t.id === SYSTEM_THEMES.light)?.scheme, 'light');
  assert.equal(THEMES.find((t) => t.id === SYSTEM_THEMES.dark)?.scheme, 'dark');
  assert.ok(THEMES.some((t) => t.id === BASE_THEME_ID));
});

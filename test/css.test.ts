import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateCss, themeDeclarations, validateTheme } from '../src/css.js';
import { THEMES, type Theme } from '../src/themes.js';

const css = generateCss(THEMES);

function blockBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing block ${selector}`);
  return css.slice(start, css.indexOf('}', start));
}

test('one [data-theme] block per theme, each with color-scheme and every colour token', () => {
  for (const theme of THEMES) {
    const body = blockBody(`[data-theme="${theme.id}"]`);
    assert.ok(body.includes(`color-scheme: ${theme.scheme};`), theme.id);
    for (const [name, value] of themeDeclarations(theme)) assert.ok(body.includes(`${name}: ${value};`), `${theme.id} ${name}`);
  }
  assert.equal(css.match(/\[data-theme="[a-z0-9-]+"\] \{/g)?.length, THEMES.length);
});

test('classic-light sits on :root; classic-dark applies under prefers dark with no data-theme', () => {
  const root = blockBody(':root');
  assert.ok(root.includes('color-scheme: light;'));
  assert.ok(root.includes('--surface: #EEF1F8;'));
  assert.ok(root.includes('--font-serif:'));
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\[data-theme\]\) \{\n {4}color-scheme: dark;\n {4}--surface: #0F1220;/);
});

test('token names are kebab-case', () => {
  const names = themeDeclarations(THEMES[0]).map(([n]) => n);
  for (const n of ['--surface', '--surface-2', '--text-body', '--text-muted', '--card-line-hover', '--line-strong', '--shadow-rest', '--radius-card', '--font-mono']) {
    assert.ok(names.includes(n), n);
  }
});

const base = THEMES[0];
const variant = (patch: Partial<Theme>): Theme => ({ ...base, id: 'x-test', ...patch });

test('rejects unsafe ids and values, unvetted fonts and duplicate ids', () => {
  assert.throws(() => validateTheme(variant({ id: 'Bad Id' })), /bad theme id/);
  assert.throws(() => validateTheme(variant({ id: 'x"]{}' })), /bad theme id/);
  assert.throws(() => validateTheme(variant({ color: { ...base.color, accent: 'red; } body { x: y' } })), /unsafe value/);
  assert.throws(() => validateTheme(variant({ font: { serif: 'Comic Sans MS', mono: 'monospace' } })), /VETTED_FONTS/);
  assert.throws(() => generateCss([...THEMES, { ...THEMES[1] }]), /duplicate theme id/);
});

test('the base theme must define shadow, radius and font', () => {
  const { font: _font, ...noFont } = THEMES[0];
  assert.throws(() => generateCss([noFont, ...THEMES.slice(1)]), /must define/);
});

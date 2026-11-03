// The built site-shell data (shell/generated/build.json): the inline boot is the
// catalogue's boot, minified, and runs before first paint in a bare context.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { STORAGE_KEY } from '../src/boot.js';
import { themeDeclarations } from '../src/css.js';
import { BASE_THEME_ID, THEMES, THEME_IDS } from '../src/themes.js';

const build = JSON.parse(readFileSync(new URL('../../shell/generated/build.json', import.meta.url), 'utf8')) as {
  id: string; inline: string; scripts: string[];
};
const boot = /<script data-site-shell>([\s\S]*?)<\/script>/.exec(build.inline)![1];
const style = /<style data-site-shell>([\s\S]*?)<\/style>/.exec(build.inline)![1];

function run(stored: string | null, prefersDark: boolean): string | undefined {
  const attrs: Record<string, string> = {};
  const w = {
    document: { documentElement: { setAttribute: (n: string, v: string) => (attrs[n] = v) } },
    localStorage: { getItem: (k: string) => (k === STORAGE_KEY ? stored : null) },
    matchMedia: () => ({ matches: prefersDark, addEventListener() {} }),
    addEventListener() {},
  };
  vm.runInNewContext(boot, { window: w });
  return attrs['data-theme'];
}

test('the build id is a 12-hex content hash and names the asset directory', () => {
  assert.match(build.id, /^[0-9a-f]{12}$/);
  assert.deepEqual(build.scripts, ['site.js']);
  readFileSync(new URL(`../../shell/public/_site/${build.id}/site.js`, import.meta.url));
});

test('the inline boot applies a stored theme, and System / unknown ids follow the OS', () => {
  assert.equal(run('classic-dark', false), 'classic-dark');
  assert.equal(run('system', true), 'classic-dark');
  assert.equal(run('slate-dark', false), 'classic-light');
  assert.equal(run(null, true), 'classic-dark');
});

test('the inline boot references nothing outside itself (no bundler helpers such as __name)', () => {
  assert.doesNotMatch(boot, /__name|require\(|import /);
});

test('the inline tokens define every theme id, with the base theme on :root; the app fallback is the base theme at zero specificity', () => {
  assert.ok(style.startsWith(':root,[data-theme="classic-light"]{'));
  for (const id of THEME_IDS) assert.ok(style.includes(`[data-theme="${id}"]`), id);
  assert.doesNotMatch(style, /<|\/\*/);

  // shell/generated/fallback.css: what each app copies once, so a page that
  // compose() skipped still has every token (Classic Light).
  const fallback = readFileSync(new URL('../../shell/generated/fallback.css', import.meta.url), 'utf8');
  const body = /^:where\(:root\)\{([^}]*)\}$/m.exec(fallback);
  assert.ok(body, 'one :where(:root) block');
  const base = THEMES.find((t) => t.id === BASE_THEME_ID)!;
  for (const [name, value] of themeDeclarations(base)) assert.ok(body[1].includes(`${name}:${value}`), name);
});

test('the inline markup stays small (bytes added to every page)', () => {
  assert.ok(Buffer.byteLength(build.inline) < 4096, `${Buffer.byteLength(build.inline)} B`);
});

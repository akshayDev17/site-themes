// The built site-shell data (shell/generated/build.json): the inline boot is the
// catalogue's boot, minified, and runs before first paint in a bare context.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { keptBuilds, parseBuilds, releasedBuilds } from '../scripts/shell-builds.js';
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

test('retention counts released builds: local rebuilds before a commit never push a released build out', () => {
  // Production serves A; three local token tweaks build B, C and D before D is committed.
  const released = ['A'];
  for (const id of ['B', 'C', 'D']) assert.deepEqual(keptBuilds(released, id, 3), ['A', id]);

  // Rebuilding the committed build changes nothing (a clean checkout in CI).
  assert.deepEqual(keptBuilds(['A', 'D'], 'D', 3), ['A', 'D']);
  // A fourth release drops the oldest one only.
  assert.deepEqual(keptBuilds(['A', 'D', 'E'], 'F', 3), ['D', 'E', 'F']);
  // An id released earlier moves to the end instead of appearing twice.
  assert.deepEqual(keptBuilds(['A', 'D', 'E'], 'A', 3), ['D', 'E', 'A']);
  assert.deepEqual(parseBuilds('A\nD\n'), ['A', 'D']);
});

test('retention counts what main deployed: a pull request committing builds B, C and D keeps deployed build A', () => {
  const repo = mkdtempSync(join(tmpdir(), 'site-shell-builds-'));
  const file = 'shell/generated/builds.txt';
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  const commit = (ids: string[]) => {
    writeFileSync(join(repo, file), ids.join('\n') + '\n');
    git('add', file);
    git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', ids.join(','));
  };
  try {
    git('init', '-q', '-b', 'main');
    mkdirSync(join(repo, 'shell/generated'), { recursive: true });
    commit(['A']);
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('checkout', '-qb', 'pr');
    // What a HEAD-based history would have committed over three rounds.
    commit(['A', 'B']);
    commit(['A', 'B', 'C']);

    assert.deepEqual(releasedBuilds(repo, file), ['A']);
    assert.deepEqual(keptBuilds(releasedBuilds(repo, file), 'D', 3), ['A', 'D']);

    // Main moved on and deployed E: the branch's merge-base still decides until it merges main.
    git('checkout', '-q', 'main');
    commit(['A', 'E']);
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('checkout', '-q', 'pr');
    assert.deepEqual(releasedBuilds(repo, file), ['A']);

    // No origin/main (a shallow pull-request checkout): the working copy, which ends with the committed build.
    git('update-ref', '-d', 'refs/remotes/origin/main');
    assert.deepEqual(keptBuilds(releasedBuilds(repo, file), 'C', 3), ['A', 'B', 'C']);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

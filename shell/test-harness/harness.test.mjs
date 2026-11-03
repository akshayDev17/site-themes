// The local wrangler dev harness: each test runs app Workers carrying the
// site-shell hook and the site-shell Worker in workerd, in one
// `wrangler dev -c <app> -c <shell>` session, with no Cloudflare account.
//
//   node shell/test-harness/make-fixtures.mjs && npm run test:shell
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');
const wrangler = join(repo, 'node_modules/.bin/wrangler');
const scratch = mkdtempSync(join(tmpdir(), 'site-shell-harness-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const build = () => JSON.parse(readFileSync(join(repo, 'shell/generated/build.json'), 'utf8'));
const app = (name) => `shell/test-harness/apps/${name}/wrangler.jsonc`;
const SHELL = 'shell/wrangler.jsonc';
const THROWING_SHELL = 'shell/test-harness/shell-throw.jsonc';
const MIDSTREAM_SHELL = 'shell/test-harness/shell-midstream.jsonc';
const ROUTED_SHELL = 'shell/test-harness/shell-routed.jsonc';
let nextPort = 18801;

/**
 * Starts one wrangler dev session and stops it when the test ends. The dev
 * registry is private to this run: a site-shell left running by any other
 * session would otherwise answer this session's SHELL binding.
 */
async function session(t, configs) {
  const port = nextPort++;
  const args = ['dev', ...configs.flatMap((c) => ['-c', c]), '--ip', '127.0.0.1', '--port', String(port),
    '--inspector-port', String(port + 1000), '--persist-to', join(scratch, 'state'), '--log-level', 'info'];
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_REGISTRY_PATH: join(scratch, 'registry') };
  const child = spawn(wrangler, args, { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const exited = new Promise((r) => child.on('exit', r));
  const s = { base: `http://127.0.0.1:${port}`, log: () => log };
  t.after(() => {
    child.kill('SIGTERM');
    return exited;
  });
  for (let i = 0; i < 120 && !/Ready on/.test(log); i++) await new Promise((r) => setTimeout(r, 500));
  if (!/Ready on/.test(log)) throw new Error(`wrangler dev did not start:\n${log}`);
  return s;
}

/** Worker console output reaches wrangler's stdout a moment after the response. */
async function logMatching(s, re) {
  for (let i = 0; i < 40 && !re.test(s.log()); i++) await new Promise((r) => setTimeout(r, 100));
  return s.log();
}

/** Status, body and whether it is the whole page, without throwing on a broken stream. */
async function outcome(url) {
  const res = await fetch(url).catch((e) => e);
  if (res instanceof Error) return { status: 0, text: '', complete: false, note: `fetch rejected: ${res.cause?.code ?? res.message}` };
  const text = await res.text().catch((e) => `BODY ERROR ${e.cause?.code ?? e.message}`);
  return { status: res.status, text, complete: text.trimEnd().endsWith('</html>'), note: JSON.stringify(text.slice(0, 80)) };
}

const asBuilt = (p) => readFileSync(join(here, 'apps', p), 'utf8');
const META = '<meta charSet="utf-8"/>';
const markup = (base) => `${build().inline}<script defer src="${base}${build().id}/site.js"></script>`;

test('chat (as today): compose inserts the head markup after <meta charset> and changes nothing else', async (t) => {
  const s = await session(t, [app('chat'), SHELL]);
  const res = await fetch(`${s.base}/chat-archives`);
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-site-shell'), `${build().id}; app=chat`);
  assert.equal(res.headers.get('etag'), null, 'composed HTML carries no validator');
  const expected = asBuilt('chat/out/chat-archives.html').replace(META, META + markup('/chat-archives/_site/'));
  assert.equal(body, expected, 'byte for byte: the page as built plus one insertion');
  assert.ok(body.indexOf(META) < 1024, '<meta charset> stays inside the first 1024 bytes');
  assert.equal(body.match(/data-site-shell/g).length, 2, 'one boot <script> and one tokens <style>');

  // Anything that is not HTML passes through untouched, validators and 304 included.
  const css = await fetch(`${s.base}/_next/static/css/060d43116cea3511.css`);
  assert.equal(css.headers.get('x-site-shell'), null);
  const etag = css.headers.get('etag');
  assert.ok(etag);
  const revalidated = await fetch(`${s.base}/_next/static/css/060d43116cea3511.css`, { headers: { 'if-none-match': etag } });
  assert.equal(revalidated.status, 304);

  // site-shell's files through the app's own route: immutable; a missing build is never cached.
  const js = await fetch(`${s.base}/chat-archives/_site/${build().id}/site.js`);
  assert.equal(js.status, 200);
  assert.equal(js.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.match(await js.text(), /site-theme-picker/);
  const missing = await fetch(`${s.base}/chat-archives/_site/000000000000/site.js`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'no-store');

  // Timing, reported only: the same bytes served as HTML (composed) and as text/plain (passed through).
  const time = async (path, n = 40) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) await (await fetch(`${s.base}${path}`)).arrayBuffer();
    return (performance.now() - t0) / n;
  };
  for (const size of ['50', '500']) {
    await time(`/chat-archives/big${size}`, 5);
    const html = await time(`/chat-archives/big${size}`);
    const text = await time(`/chat-archives/big${size}.txt`);
    t.diagnostic(`${size} KB page: composed ${html.toFixed(2)} ms, passed through ${text.toFixed(2)} ms, compose adds ${(html - text).toFixed(2)} ms (local wall clock)`);
  }
});

test('chat (unbound): with no SHELL binding the page is served exactly as built', async (t) => {
  const s = await session(t, [app('chat-unbound')]);
  const res = await fetch(`${s.base}/chat-archives`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-site-shell'), null);
  assert.equal(await res.text(), asBuilt('chat-migrated/out/chat-archives.html'));
});

test('chat (bound, site-shell not running): compose rejects and the page is fetched again as built', async (t) => {
  const s = await session(t, [app('chat-shell-down')]);
  const res = await fetch(`${s.base}/chat-archives`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), asBuilt('chat-migrated/out/chat-archives.html'));
  assert.match(await logMatching(s, /site-shell: compose failed/), /site-shell: compose failed/);
});

test('chat (site-shell throws): fail open to the page as built', async (t) => {
  const s = await session(t, [app('chat-shell-down'), THROWING_SHELL]);
  const res = await fetch(`${s.base}/chat-archives`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), asBuilt('chat-migrated/out/chat-archives.html'));
  assert.match(await logMatching(s, /fault: compose threw/), /fault: compose threw/);
});

test('the first-sketch hook (catch { return res }) answers 500: the body already went to site-shell', async (t) => {
  const s = await session(t, [app('chat-naive'), THROWING_SHELL]);
  const r = await outcome(`${s.base}/chat-archives`);
  t.diagnostic(`status ${r.status}: ${r.note}`);
  assert.equal(r.status, 500);
  assert.notEqual(r.text, asBuilt('chat-migrated/out/chat-archives.html'));
});

test('a fault after the response has started streaming cannot fall back (11 KB page)', async (t) => {
  const s = await session(t, [app('chat-shell-down'), MIDSTREAM_SHELL]);
  const r = await outcome(`${s.base}/chat-archives`);
  t.diagnostic(`status ${r.status}, ${r.text.length} chars: ${r.note}`);
  assert.equal(r.complete, false, 'never the full page');
});

test('a fault after the response has started streaming cannot fall back (500 KB page)', async (t) => {
  const s = await session(t, [app('chat'), MIDSTREAM_SHELL]);
  const r = await outcome(`${s.base}/chat-archives/big500`);
  t.diagnostic(`status ${r.status}, ${r.text.length} of about 514000 chars: ${r.note}`);
  assert.equal(r.complete, false, 'never the full page');
});

test('atlas: run_worker_first for the four pages composes the HTML; other files stay static', async (t) => {
  const s = await session(t, [app('atlas'), SHELL]);
  for (const path of ['/elections/india/', '/elections/india/state/', '/elections/india/state/?s=IN-UP&y=2024']) {
    const res = await fetch(`${s.base}${path}`);
    const body = await res.text();
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get('x-site-shell'), `${build().id}; app=atlas`, path);
    assert.ok(body.includes(`<script defer src="/elections/india/_site/${build().id}/site.js"></script>`), path);
  }
  const moved = await fetch(`${s.base}/elections`, { redirect: 'manual' });
  assert.equal(moved.status, 308);
  const css = await fetch(`${s.base}/elections/india/_next/static/css/274c034f0c047d45.css`);
  assert.equal(css.status, 200);
  assert.equal(css.headers.get('x-site-shell'), null);
  assert.equal((await fetch(`${s.base}/elections/india/_site/${build().id}/site.js`)).status, 200);
});

test('graph: /graph/ composed, sw.js still no-cache, /graph/_site/ forwarded', async (t) => {
  const s = await session(t, [app('graph'), SHELL]);
  const res = await fetch(`${s.base}/graph/`);
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes(`<script defer src="/graph/_site/${build().id}/site.js"></script>`));
  assert.equal((await fetch(`${s.base}/graph/sw.js`)).headers.get('cache-control'), 'no-cache');
  assert.equal((await fetch(`${s.base}/graph/_site/${build().id}/site.js`)).status, 200);
});

test('ASSET_BASE on site-shell moves every app to /_site/ with no app change', async (t) => {
  const s = await session(t, [app('graph'), ROUTED_SHELL]);
  const body = await (await fetch(`${s.base}/graph/`)).text();
  assert.ok(body.includes(`<script defer src="/_site/${build().id}/site.js"></script>`));
});

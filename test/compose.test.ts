// compose() itself (shell/compose.ts), run in workerd through Miniflare, since
// HTMLRewriter exists only there: pages with and without <site-slot>s, and an
// unlisted app.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { Miniflare } from 'miniflare';
import { sitePathMarkup, siteAppsMarkup, type Crumb } from '../shell/nav.js';
import { APPS } from '../src/apps.js';

const root = new URL('../../', import.meta.url);
const BUILD = { id: '0123456789ab', inline: '<script data-site-shell>boot()</script><style data-site-shell>:root{}</style>', scripts: ['site.js'] };
const HEAD = `${BUILD.inline}<script defer src="/_site/${BUILD.id}/site.js"></script>`;
const NOINDEX = '<meta name="robots" content="noindex" data-site-shell>';

// A Worker that composes the POSTed page as ?app=<id>, with ?unlisted=<id> apps set listed:false.
const WORKER = `
import { composeResponse } from './shell/compose.ts';
import { APPS } from './src/apps.ts';
const BUILD = ${JSON.stringify(BUILD)};
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const unlisted = url.searchParams.getAll('unlisted');
    const apps = APPS.map((a) => (unlisted.includes(a.id) ? { ...a, listed: false } : a));
    const page = new Response(await request.text(), { headers: { 'content-type': 'text/html; charset=utf-8', etag: '"app"' } });
    return composeResponse(page, { app: url.searchParams.get('app'), assetBase: '/_site/' }, BUILD, apps);
  },
};`;

let mf: Miniflare;
before(async () => {
  const out = await esbuild({
    stdin: { contents: WORKER, resolveDir: fileURLToPath(root), loader: 'ts', sourcefile: 'compose-test-worker.ts' },
    bundle: true,
    format: 'esm',
    target: 'es2022',
    write: false,
  });
  const modules = { 'worker.js': { type: 'esm' as const, contents: out.outputFiles[0].text } };
  mf = new Miniflare({ workers: [{ config: { name: 'compose', compatibilityDate: '2026-10-10', manifest: { mainModule: 'worker.js', modules } } }] });
});
after(() => mf?.dispose());

async function compose(page: string, app: string, unlisted: string[] = []) {
  const q = new URLSearchParams({ app });
  for (const id of unlisted) q.append('unlisted', id);
  const res = await mf.dispatchFetch(`http://compose.test/?${q}`, { method: 'POST', body: page });
  return { status: res.status, headers: res.headers, body: await res.text() };
}

const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`;
const composed = (body: string, head = HEAD) => page(body).replace('<meta charset="utf-8">', `<meta charset="utf-8">${head}`);
const slot = (attrs: string, inner: string) => `<site-slot ${attrs}>${inner}</site-slot>`;

test('a page with no slot gets the head block and nothing else', async () => {
  const body = '<header><a href="/">← Akshay Prabhakant</a></header><main>hi</main>';
  const r = await compose(page(body), 'atlas');
  assert.equal(r.status, 200);
  assert.equal(r.body, composed(body));
  assert.equal(r.headers.get('etag'), null);
});

test('the saved app fixtures have no slot: composing them inserts the head block only, byte for byte', async () => {
  const fixtures: [string, string, string][] = [
    ['home.html', 'home', '<meta charset="utf-8">'],
    ['chat.html', 'chat', '<meta charSet="utf-8"/>'],
    ['quiz.html', 'quiz', '<meta charSet="utf-8"/>'],
    ['graph.html', 'graph', '<meta charSet="utf-8"/>'],
    ['atlas.html', 'atlas', '<meta charSet="utf-8"/>'],
    ['atlas-state.html', 'atlas', '<meta charSet="utf-8"/>'],
  ];
  for (const [file, app, meta] of fixtures) {
    const html = readFileSync(new URL(`shell/test-harness/fixtures/${file}`, root), 'utf8');
    assert.ok(!html.includes('<site-slot'), `${file} has no slot`);
    const r = await compose(html, app);
    assert.equal(r.body, html.replace(meta, meta + HEAD), file);
  }
});

test('<site-slot name="site-path">: its content becomes the site path, the element and its attributes stay', async () => {
  const tail: Crumb[] = [{ label: 'India', href: '/elections/india/' }, { label: 'Uttar Pradesh' }];
  const attrs = `name="site-path" data-tail='${JSON.stringify(tail)}'`;
  const r = await compose(page(`<header>${slot(attrs, '<a href="/">← Akshay Prabhakant</a>')}<h1>Atlas</h1></header>`), 'atlas');
  assert.equal(r.body, composed(`<header>${slot(attrs, sitePathMarkup('atlas', tail)!)}<h1>Atlas</h1></header>`));
  assert.ok(!r.body.includes('← Akshay Prabhakant'), 'the fallback is replaced');
});

test('a React-style data-tail (double-quoted, entity-escaped) is decoded before it is read', async () => {
  const tail: Crumb[] = [{ label: 'Jammu & Kashmir', href: '/elections/india/jk/' }, { label: `"Q" & A's <b>` }];
  const reactAttr = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[c]!);
  const attrs = `name="site-path" data-tail="${reactAttr(JSON.stringify(tail))}"`;
  const r = await compose(page(slot(attrs, 'fallback')), 'atlas');
  assert.equal(r.body, composed(slot(attrs, sitePathMarkup('atlas', tail)!)));

  const decimal = `name="site-path" data-tail='[{"label":"Q&#38;A &#60;1&#62;"}]'`;
  const d = await compose(page(slot(decimal, 'fallback')), 'atlas');
  assert.equal(d.body, composed(slot(decimal, sitePathMarkup('atlas', [{ label: 'Q&A <1>' }])!)));
});

test('<site-slot name="site-apps">: the homepage list; slots work anywhere in the body', async () => {
  const body = `<main><section id="apps"><div>${slot('name="site-apps"', '<p>apps</p>')}</div></section></main>`;
  const r = await compose(page(body), 'home');
  assert.equal(r.body, composed(body.replace('<p>apps</p>', siteAppsMarkup())));
});

test('each slot is filled once; unknown slot names, unknown apps and a malformed tail leave the slot as written', async () => {
  const path = slot('name="site-path"', 'fallback');
  const r = await compose(page(path + path + slot('name="site-menu"', 'menu') + '<site-slot>bare</site-slot>'), 'chat');
  assert.equal(r.body, composed(slot('name="site-path"', sitePathMarkup('chat')!) + path + slot('name="site-menu"', 'menu') + '<site-slot>bare</site-slot>'));

  const unknown = await compose(page(path), 'nope');
  assert.equal(unknown.body, composed(path), 'an app missing from the list keeps its fallback');

  const bad = slot(`name="site-path" data-tail='[{"label":"x","href":"javascript:alert(1)"}]'`, 'fallback');
  const malformed = await compose(page(bad + slot('name="site-apps"', '')), 'atlas');
  assert.equal(malformed.body, composed(bad + slot('name="site-apps"', siteAppsMarkup())), 'only the malformed slot is skipped');
});

test('listed:false: the app\'s pages are noindex and say "Not listed"; other apps leave it out', async () => {
  const path = slot('name="site-path"', '');
  const own = await compose(page(path), 'graph', ['graph']);
  const apps = APPS.map((a) => (a.id === 'graph' ? { ...a, listed: false } : a));
  assert.equal(own.body, composed(slot('name="site-path"', sitePathMarkup('graph', [], apps)!), HEAD + NOINDEX));
  assert.ok(own.body.includes('Not listed'));

  // noindex does not depend on a slot.
  const bare = await compose(page('<main></main>'), 'graph', ['graph']);
  assert.equal(bare.body, composed('<main></main>', HEAD + NOINDEX));

  const other = await compose(page(path + slot('name="site-apps"', '')), 'atlas', ['graph']);
  assert.ok(!other.body.includes(NOINDEX));
  assert.ok(!other.body.includes('Graph Notes'));
  assert.ok(!other.body.includes('href="/graph/"'));
});

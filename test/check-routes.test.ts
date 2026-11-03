// scripts/check-routes.ts, run as the deploy workflow runs it, against a local
// stand-in for the Cloudflare API serving the zone's Worker routes.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { diffRoutes, readConfig } from '../scripts/check-routes.js';

const script = fileURLToPath(new URL('../scripts/check-routes.js', import.meta.url));
const config = fileURLToPath(new URL('../../shell/wrangler.jsonc', import.meta.url));
const TOKEN = 'test-token-must-never-be-printed';
const ZONE_ID = 'zone123';
const ATTACHED = [
  { id: 'r1', pattern: 'akshayprabhakant.com/_site/*', script: 'site-shell' },
  { id: 'r2', pattern: 'akshayprabhakant.com/', script: 'site-shell' },
];
const OTHER_WORKERS = [
  { id: 'r3', pattern: 'akshayprabhakant.com/chat-archives', script: 'ai-chat-archive-frontend' },
  { id: 'r4', pattern: 'akshayprabhakant.com/elections/*', script: 'election-atlas' },
  { id: 'r5', pattern: 'akshayprabhakant.com/quiz*', script: null },
];

interface Api {
  zones?: unknown[];
  routes?: unknown[];
  status?: number;
}

/** Runs the compiled script against a stand-in API; returns its exit code, output and the requests seen. */
async function run(api: Api, env: Record<string, string | undefined> = {}) {
  const seen: IncomingMessage[] = [];
  const server = createServer((req, res) => {
    seen.push(req);
    const json = (status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(401, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] });
    if (api.status) return json(api.status, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] });
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/client/v4/zones' && url.searchParams.get('name') === 'akshayprabhakant.com') {
      return json(200, { success: true, result: api.zones ?? [{ id: ZONE_ID, name: 'akshayprabhakant.com' }] });
    }
    if (url.pathname === `/client/v4/zones/${ZONE_ID}/workers/routes`) return json(200, { success: true, result: api.routes ?? [] });
    return json(404, { success: false, errors: [{ code: 7003, message: 'No route for that URI' }] });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    return await new Promise<{ code: number; out: string; seen: IncomingMessage[] }>((resolve) => {
      execFile(process.execPath, [script, config], {
        env: { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_API_BASE: base, ...env },
      }, (err, stdout, stderr) => resolve({ code: err ? Number(err.code ?? 1) : 0, out: stdout + stderr, seen }));
    });
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('passes when site-shell owns exactly the two configured routes; other Workers\' routes are ignored', async () => {
  const r = await run({ routes: [...OTHER_WORKERS, ...ATTACHED] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ok: akshayprabhakant\.com\/_site\/\* -> site-shell/);
  assert.match(r.out, /ok: akshayprabhakant\.com\/ -> site-shell/);
  assert.deepEqual(r.seen.map((q) => q.url), ['/client/v4/zones?name=akshayprabhakant.com', `/client/v4/zones/${ZONE_ID}/workers/routes`]);
  assert.ok(!r.out.includes(TOKEN));
});

test('fails when a configured route is not attached', async () => {
  const r = await run({ routes: [ATTACHED[0], ...OTHER_WORKERS] });
  assert.equal(r.code, 1);
  assert.match(r.out, /missing: akshayprabhakant\.com\/ is not attached to site-shell/);
});

test('fails when the exact / route belongs to another Worker', async () => {
  const r = await run({ routes: [ATTACHED[0], { id: 'r9', pattern: 'akshayprabhakant.com/', script: 'something-else' }] });
  assert.equal(r.code, 1);
  assert.match(r.out, /missing: akshayprabhakant\.com\/ is not attached to site-shell/);
});

test('fails when site-shell owns a route the config does not list, such as the catch-all', async () => {
  const r = await run({ routes: [...ATTACHED, { id: 'r9', pattern: 'akshayprabhakant.com/*', script: 'site-shell' }] });
  assert.equal(r.code, 1);
  assert.match(r.out, /unexpected: akshayprabhakant\.com\/\* is attached to site-shell but not in the config/);
});

test('fails on an API error or an unknown zone, naming the problem and never the token', async () => {
  const denied = await run({ status: 403 });
  assert.equal(denied.code, 1);
  assert.match(denied.out, /Cloudflare API \/zones answered HTTP 403: 10000 Authentication error/);
  assert.ok(!denied.out.includes(TOKEN));

  const noZone = await run({ zones: [] });
  assert.equal(noZone.code, 1);
  assert.match(noZone.out, /zone akshayprabhakant\.com: expected one zone, the API listed 0/);

  const noToken = await run({}, { CLOUDFLARE_API_TOKEN: '' });
  assert.equal(noToken.code, 1);
  assert.match(noToken.out, /CLOUDFLARE_API_TOKEN is not set/);
  assert.equal(noToken.seen.length, 0);
});

test('the expected routes come from shell/wrangler.jsonc: exactly the two approved patterns', () => {
  const { name, zones } = readConfig(config);
  assert.equal(name, 'site-shell');
  assert.deepEqual([...zones.keys()], ['akshayprabhakant.com']);
  assert.deepEqual([...zones.get('akshayprabhakant.com')!].sort(), ['akshayprabhakant.com/', 'akshayprabhakant.com/_site/*']);
});

test('diffRoutes reports missing and unexpected patterns for one script only', () => {
  const expected = ['a.com/', 'a.com/_site/*'];
  assert.deepEqual(diffRoutes(expected, ATTACHED.map((r) => ({ ...r, pattern: r.pattern.replace('akshayprabhakant', 'a') })), 'site-shell'), { missing: [], unexpected: [] });
  assert.deepEqual(diffRoutes(expected, [{ pattern: 'a.com/*', script: 'site-shell' }, { pattern: 'a.com/', script: 'other' }], 'site-shell'),
    { missing: ['a.com/', 'a.com/_site/*'], unexpected: ['a.com/*'] });
});

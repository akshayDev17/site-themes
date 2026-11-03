// A minimal Chrome DevTools Protocol client for the browser tests: launches a
// headless Chrome and speaks CDP over Node's built-in WebSocket, so the tests
// need no browser-automation dependency. CHROME_PATH picks the browser.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function chromePath() {
  const found = process.env.CHROME_PATH || CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error(`no Chrome found; set CHROME_PATH (looked in ${CANDIDATES.join(', ')})`);
  return found;
}

/** Starts headless Chrome; returns { page, close }. page(sessionCall) drives one new tab. */
export async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), 'site-shell-chrome-'));
  const child = spawn(chromePath(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--no-sandbox', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const exited = new Promise((r) => child.on('exit', r));
  const url = await new Promise((resolve, reject) => {
    let err = '';
    child.stderr.on('data', (d) => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\S+)/);
      if (m) resolve(m[1]);
    });
    child.on('exit', () => reject(new Error(`Chrome exited before listening:\n${err}`)));
  });
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)));
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const p = m.id && pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(`${p.method}: ${m.error.message}`));
    else p.resolve(m.result);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  /** A new tab: call(method, params) on it, and evaluate(expression) for a JSON value. */
  async function newPage() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId);
    const evaluate = async (expression) => {
      const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    return { call, evaluate, close: () => send('Target.closeTarget', { targetId }) };
  }
  return {
    newPage,
    close: async () => {
      ws.close();
      child.kill();
      await exited;
      // Chrome's helpers can still be writing the profile after the browser exits; a
      // leftover temp directory is harmless, so a failed removal never fails the tests.
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    },
  };
}

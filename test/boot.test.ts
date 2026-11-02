// Runs the exact inline string (bootScript) in a bare VM context with a fake window.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { BOOT_CONFIG, CHANGE_EVENT, STORAGE_KEY, bootScript } from '../src/boot.js';

type Listener = (e: { key?: string | null; detail?: unknown }) => void;

interface FakeOptions {
  stored?: string;
  prefersDark?: boolean;
  storage?: 'ok' | 'missing' | 'getter-throws' | 'getitem-throws';
  matchMedia?: boolean;
}

function fakeWindow(opts: FakeOptions = {}) {
  const listeners: Record<string, Listener[]> = {};
  const attrs: Record<string, string> = {};
  const mqListeners: (() => void)[] = [];
  const mq = { matches: !!opts.prefersDark, addEventListener: (_: string, fn: () => void) => mqListeners.push(fn) };
  const store = new Map<string, string>();
  if (opts.stored !== undefined) store.set(STORAGE_KEY, opts.stored);
  const w: Record<string, unknown> = {
    document: { documentElement: { setAttribute: (n: string, v: string) => (attrs[n] = v) } },
    addEventListener: (type: string, fn: Listener) => (listeners[type] ??= []).push(fn),
  };
  if (opts.matchMedia !== false) w.matchMedia = () => mq;
  const storage = opts.storage ?? 'ok';
  if (storage === 'ok') w.localStorage = { getItem: (k: string) => store.get(k) ?? null };
  if (storage === 'getitem-throws') w.localStorage = { getItem: () => { throw new Error('SecurityError'); } };
  if (storage === 'getter-throws') {
    Object.defineProperty(w, 'localStorage', { get: () => { throw new Error('SecurityError'); } });
  }
  return {
    w,
    theme: () => attrs['data-theme'],
    store,
    listenerCount: (type: string) => (listeners[type] ?? []).length,
    fire: (type: string, e: { key?: string | null; detail?: unknown }) => (listeners[type] ?? []).forEach((fn) => fn(e)),
    setPrefersDark: (dark: boolean) => {
      mq.matches = dark;
      mqListeners.forEach((fn) => fn());
    },
  };
}

function boot(f: ReturnType<typeof fakeWindow>) {
  vm.runInNewContext(bootScript, { window: f.w });
}

test('a stored known theme id is applied', () => {
  const f = fakeWindow({ stored: 'slate-dark' });
  boot(f);
  assert.equal(f.theme(), 'slate-dark');
});

test('system follows prefers-color-scheme', () => {
  for (const [prefersDark, expected] of [[false, 'classic-light'], [true, 'classic-dark']] as const) {
    const f = fakeWindow({ stored: 'system', prefersDark });
    boot(f);
    assert.equal(f.theme(), expected);
  }
});

test('an unknown stored id falls back to System', () => {
  for (const [prefersDark, expected] of [[false, 'classic-light'], [true, 'classic-dark']] as const) {
    const f = fakeWindow({ stored: 'neon-pink', prefersDark });
    boot(f);
    assert.equal(f.theme(), expected);
  }
});

test('no stored value means System', () => {
  const f = fakeWindow({ prefersDark: true });
  boot(f);
  assert.equal(f.theme(), 'classic-dark');
});

test('missing or throwing storage falls back to System', () => {
  for (const storage of ['missing', 'getter-throws', 'getitem-throws'] as const) {
    const f = fakeWindow({ storage, prefersDark: true });
    assert.doesNotThrow(() => boot(f), storage);
    assert.equal(f.theme(), 'classic-dark', storage);
  }
});

test('no matchMedia means System resolves to light', () => {
  const f = fakeWindow({ matchMedia: false });
  boot(f);
  assert.equal(f.theme(), 'classic-light');
});

test('storage event from another tab updates the theme', () => {
  const f = fakeWindow({ stored: 'classic-light' });
  boot(f);
  f.store.set(STORAGE_KEY, 'slate-light');
  f.fire('storage', { key: STORAGE_KEY });
  assert.equal(f.theme(), 'slate-light');

  f.store.set(STORAGE_KEY, 'not-a-theme');
  f.fire('storage', { key: STORAGE_KEY });
  assert.equal(f.theme(), 'classic-light', 'unknown id from another tab -> System');
});

test('storage events for other keys are ignored; clear() resets to System', () => {
  const f = fakeWindow({ stored: 'slate-dark' });
  boot(f);
  f.store.set(STORAGE_KEY, 'classic-dark');
  f.fire('storage', { key: 'something-else' });
  assert.equal(f.theme(), 'slate-dark');

  f.store.clear();
  f.fire('storage', { key: null });
  assert.equal(f.theme(), 'classic-light');
});

test('System mode follows OS changes; an explicit theme does not', () => {
  const sys = fakeWindow({ stored: 'system' });
  boot(sys);
  sys.setPrefersDark(true);
  assert.equal(sys.theme(), 'classic-dark');

  const fixed = fakeWindow({ stored: 'slate-light' });
  boot(fixed);
  fixed.setPrefersDark(true);
  assert.equal(fixed.theme(), 'slate-light');
});

test('a same-page change event applies its choice, even when storage throws', () => {
  const f = fakeWindow({ storage: 'getitem-throws' });
  boot(f);
  f.fire(CHANGE_EVENT, { detail: 'slate-dark' });
  assert.equal(f.theme(), 'slate-dark');
  f.setPrefersDark(true);
  assert.equal(f.theme(), 'slate-dark', 'remembered choice survives an OS change');
  f.fire(CHANGE_EVENT, { detail: 'system' });
  assert.equal(f.theme(), 'classic-dark');
});

test('running twice registers listeners once', () => {
  const f = fakeWindow();
  boot(f);
  boot(f);
  assert.equal(f.listenerCount('storage'), 1);
  assert.equal(f.listenerCount(CHANGE_EVENT), 1);
});

test('the inline script embeds every catalogue id and the shared key', () => {
  for (const id of BOOT_CONFIG.ids) assert.ok(bootScript.includes(JSON.stringify(id)), id);
  assert.ok(bootScript.includes(JSON.stringify(STORAGE_KEY)));
  assert.equal(STORAGE_KEY, 'site-theme');
});

// The app list (src/apps.ts): what site-shell renders the site path and the
// homepage Apps list from.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APPS, HOME_ID, validateApps, type App } from '../src/apps.js';

test('the list is valid, in the owner-approved order, and every app starts listed', () => {
  validateApps(APPS);
  assert.deepEqual(
    APPS.map((a) => [a.id, a.label, a.path, a.gated, a.listed]),
    [
      ['home', 'Home', '/', false, true],
      ['chat', 'AI Digest', '/chat-archives', false, true],
      ['quiz', 'Quiz Room', '/quiz', true, true],
      ['graph', 'Graph Notes', '/graph/', true, true],
      ['atlas', 'Election Atlas', '/elections/india/', false, true],
    ],
  );
});

test('every app id a Worker passes to compose() is in the list', () => {
  // The ids the homepage route and the app Workers use (shell/worker.ts, shell/test-harness/apps/*/worker.js).
  for (const id of ['home', 'chat', 'quiz', 'graph', 'atlas']) assert.ok(APPS.some((a) => a.id === id), id);
});

test('labels are sentence case and every app has a one-line blurb', () => {
  for (const a of APPS) {
    assert.notEqual(a.label, a.label.toUpperCase(), a.id);
    assert.match(a.blurb, /^[A-Z][^.\n]*$/, a.id);
  }
});

test('validateApps rejects a list site-shell cannot render', () => {
  const app = (over: Partial<App>): App => ({ id: 'x', label: 'X', path: '/x', blurb: 'X', gated: false, listed: true, ...over });
  const home = APPS[0];
  const bad: [string, App[]][] = [
    ['duplicate id', [home, app({}), app({ path: '/y' })]],
    ['id outside the compose() pattern', [home, app({ id: 'Bad App' })]],
    ['relative path', [home, app({ path: 'x' })]],
    ['protocol-relative path', [home, app({ path: '//evil.example/' })]],
    ['empty label', [home, app({ label: ' ' })]],
    ['home not first', [app({}), home]],
    ['home unlisted', [{ ...home, listed: false }]],
  ];
  for (const [why, apps] of bad) assert.throws(() => validateApps(apps), Error, why);
  assert.equal(home.id, HOME_ID);
});

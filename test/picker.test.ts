import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { STORAGE_KEY } from '../src/boot.js';
import { PICKER_TAG, defineThemePicker, readThemeChoice, setThemeChoice } from '../src/picker.js';
import { THEMES } from '../src/themes.js';

function page(stored?: string) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://akshayprabhakant.com/quiz/',
  });
  const w = dom.window as unknown as Window & typeof globalThis;
  if (stored !== undefined) w.localStorage.setItem(STORAGE_KEY, stored);
  defineThemePicker(w);
  return w;
}

function mount(w: Window & typeof globalThis, attrs: Record<string, string> = {}) {
  const el = w.document.createElement(PICKER_TAG);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  w.document.body.append(el);
  const select = el.shadowRoot!.querySelector('select')!;
  const text = el.shadowRoot!.querySelector('label > span')!;
  return { el, select, text };
}

function choose(w: Window & typeof globalThis, select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new w.Event('change'));
}

test('lists System and every catalogue theme', () => {
  const w = page();
  const { select } = mount(w);
  assert.deepEqual(
    [...select.options].map((o) => [o.value, o.textContent]),
    [['system', 'System'], ...THEMES.map((t) => [t.id, t.label])],
  );
  assert.equal(select.value, 'system');
});

test('shows the stored choice; unknown stored id shows System', () => {
  assert.equal(mount(page('slate-light')).select.value, 'slate-light');
  assert.equal(mount(page('gone-theme')).select.value, 'system');
});

test('choosing a theme stores it and sets data-theme', () => {
  const w = page();
  const { select } = mount(w);
  choose(w, select, 'classic-dark');
  assert.equal(w.localStorage.getItem(STORAGE_KEY), 'classic-dark');
  assert.equal(w.document.documentElement.getAttribute('data-theme'), 'classic-dark');
  choose(w, select, 'system');
  assert.equal(w.localStorage.getItem(STORAGE_KEY), 'system');
  assert.equal(w.document.documentElement.getAttribute('data-theme'), 'classic-light');
});

test('a change in another tab updates the picker and the page', () => {
  const w = page('classic-light');
  const { select } = mount(w);
  w.localStorage.setItem(STORAGE_KEY, 'slate-dark');
  w.dispatchEvent(new w.StorageEvent('storage', { key: STORAGE_KEY, newValue: 'slate-dark' }));
  assert.equal(select.value, 'slate-dark');
  assert.equal(w.document.documentElement.getAttribute('data-theme'), 'slate-dark');
});

test('two pickers on one page stay in sync', () => {
  const w = page();
  const a = mount(w);
  const b = mount(w);
  choose(w, a.select, 'slate-light');
  assert.equal(b.select.value, 'slate-light');
});

test('a removed picker stops listening', () => {
  const w = page();
  const a = mount(w);
  const b = mount(w);
  b.el.remove();
  choose(w, a.select, 'slate-dark');
  assert.equal(b.select.value, 'system');
});

test('label and hide-label attributes', () => {
  const w = page();
  const { el, text } = mount(w, { label: 'Colours' });
  assert.equal(text.textContent, 'Colours');
  assert.equal(text.className, '');
  el.setAttribute('hide-label', '');
  assert.equal(text.className, 'visually-hidden');
});

test('setThemeChoice normalises unknown ids to system; readThemeChoice reads them back', () => {
  const w = page();
  assert.equal(setThemeChoice('bogus', w), 'system');
  assert.equal(w.localStorage.getItem(STORAGE_KEY), 'system');
  assert.equal(readThemeChoice(w), 'system');
  setThemeChoice('slate-light', w);
  assert.equal(readThemeChoice(w), 'slate-light');
  w.localStorage.setItem(STORAGE_KEY, 'removed-theme');
  assert.equal(readThemeChoice(w), 'system');
});

test('defineThemePicker is idempotent', () => {
  const w = page();
  assert.doesNotThrow(() => defineThemePicker(w));
});

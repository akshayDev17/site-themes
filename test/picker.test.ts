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
  const root = el.shadowRoot!;
  const text = root.querySelector('[part="label"]')!;
  const box = root.querySelector<HTMLElement>('[role="combobox"]')!;
  const list = root.querySelector<HTMLElement>('[role="listbox"]')!;
  const opts = [...root.querySelectorAll<HTMLElement>('[role="option"]')];
  return { el, text, box, list, opts };
}

/** The choice the control shows: the option marked selected. */
const shownChoice = (p: ReturnType<typeof mount>) => p.opts.find((o) => o.getAttribute('aria-selected') === 'true')?.dataset.value;

/** Chooses `value` the way a pointer does: open the list, click the option. */
function choose(p: ReturnType<typeof mount>, value: string) {
  p.box.click();
  p.opts.find((o) => o.dataset.value === value)!.click();
}

test('lists System and every catalogue theme', () => {
  const w = page();
  const p = mount(w);
  assert.deepEqual(
    p.opts.map((o) => [o.dataset.value, o.textContent]),
    [['system', 'System'], ...THEMES.map((t) => [t.id, t.label])],
  );
  assert.deepEqual(
    p.opts.map((o) => o.textContent),
    ['System', 'Classic Light', 'Classic Dark'],
  );
  assert.equal(shownChoice(p), 'system');
});

test('shows the stored choice; unknown stored id shows System', () => {
  assert.equal(shownChoice(mount(page('classic-dark'))), 'classic-dark');
  assert.equal(shownChoice(mount(page('gone-theme'))), 'system');
});

test('a stored slate id (removed in 0.2.0) shows System and resolves through prefers-color-scheme', () => {
  for (const stored of ['slate-light', 'slate-dark']) {
    const w = page(stored);
    assert.equal(shownChoice(mount(w)), 'system', stored);
    assert.equal(readThemeChoice(w), 'system', stored);
    assert.equal(w.document.documentElement.getAttribute('data-theme'), 'classic-light', stored);
  }
});

test('choosing a theme stores it and sets data-theme', () => {
  const w = page();
  const p = mount(w);
  choose(p, 'classic-dark');
  assert.equal(w.localStorage.getItem(STORAGE_KEY), 'classic-dark');
  assert.equal(w.document.documentElement.getAttribute('data-theme'), 'classic-dark');
  choose(p, 'system');
  assert.equal(w.localStorage.getItem(STORAGE_KEY), 'system');
  assert.equal(w.document.documentElement.getAttribute('data-theme'), 'classic-light');
});

test('a change in another tab updates the picker and the page', () => {
  const w = page('classic-light');
  const p = mount(w);
  w.localStorage.setItem(STORAGE_KEY, 'classic-dark');
  w.dispatchEvent(new w.StorageEvent('storage', { key: STORAGE_KEY, newValue: 'classic-dark' }));
  assert.equal(shownChoice(p), 'classic-dark');
  assert.equal(w.document.documentElement.getAttribute('data-theme'), 'classic-dark');
});

test('two pickers on one page stay in sync', () => {
  const w = page();
  const a = mount(w);
  const b = mount(w);
  choose(a, 'classic-dark');
  assert.equal(shownChoice(b), 'classic-dark');
});

test('a removed picker stops listening', () => {
  const w = page();
  const a = mount(w);
  const b = mount(w);
  b.el.remove();
  choose(a, 'classic-dark');
  assert.equal(shownChoice(b), 'system');
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
  setThemeChoice('classic-dark', w);
  assert.equal(readThemeChoice(w), 'classic-dark');
  assert.equal(setThemeChoice('slate-light', w), 'system');
  assert.equal(readThemeChoice(w), 'system');
  w.localStorage.setItem(STORAGE_KEY, 'removed-theme');
  assert.equal(readThemeChoice(w), 'system');
});

test('defineThemePicker is idempotent', () => {
  const w = page();
  assert.doesNotThrow(() => defineThemePicker(w));
});

// The control: a select-only combobox (WAI-ARIA APG).
function key(w: Window & typeof globalThis, target: HTMLElement, k: string, init: KeyboardEventInit = {}) {
  const e = new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}
const state = (p: ReturnType<typeof mount>) => ({
  expanded: p.box.getAttribute('aria-expanded'),
  active: p.box.getAttribute('aria-activedescendant'),
  selected: p.opts.filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.dataset.value),
  shown: p.box.querySelector('.current')!.textContent,
});

test('the control is a labelled select-only combobox over a listbox of every choice', () => {
  const w = page('classic-dark');
  const p = mount(w);
  assert.equal(p.box.getAttribute('tabindex'), '0');
  assert.equal(p.box.getAttribute('aria-haspopup'), 'listbox');
  assert.equal(p.box.getAttribute('aria-controls'), p.list.id);
  assert.equal(p.box.getAttribute('aria-labelledby'), p.text.id);
  assert.equal(p.list.getAttribute('aria-labelledby'), p.text.id);
  assert.equal(p.text.textContent, 'Theme');
  assert.deepEqual(p.opts.map((o) => [o.dataset.value, o.textContent]), [['system', 'System'], ...THEMES.map((t) => [t.id, t.label])]);
  assert.deepEqual(state(p), { expanded: 'false', active: null, selected: ['classic-dark'], shown: 'Classic Dark' });
});

test('keyboard: arrows, Home/End, Enter, Escape and Tab follow the APG select-only combobox', () => {
  const w = page();
  const p = mount(w);
  assert.ok(key(w, p.box, 'ArrowDown').defaultPrevented);
  assert.deepEqual(state(p), { expanded: 'true', active: 'option-system', selected: ['system'], shown: 'System' });
  key(w, p.box, 'ArrowDown');
  key(w, p.box, 'ArrowDown');
  key(w, p.box, 'ArrowDown'); // stays on the last option
  assert.equal(state(p).active, 'option-classic-dark');
  key(w, p.box, 'ArrowUp');
  assert.equal(state(p).active, 'option-classic-light');
  key(w, p.box, 'Escape'); // closes, nothing chosen
  assert.deepEqual(state(p), { expanded: 'false', active: null, selected: ['system'], shown: 'System' });
  assert.equal(w.localStorage.getItem(STORAGE_KEY), null);

  key(w, p.box, 'End');
  assert.equal(state(p).active, 'option-classic-dark');
  key(w, p.box, 'Home');
  assert.equal(state(p).active, 'option-system');
  key(w, p.box, 'End');
  key(w, p.box, 'Enter');
  assert.deepEqual(state(p), { expanded: 'false', active: null, selected: ['classic-dark'], shown: 'Classic Dark' });
  assert.equal(w.localStorage.getItem(STORAGE_KEY), 'classic-dark');
  assert.equal(w.document.documentElement.getAttribute('data-theme'), 'classic-dark');

  key(w, p.box, ' '); // Space opens on the chosen option
  assert.equal(state(p).active, 'option-classic-dark');
  key(w, p.box, 'ArrowUp');
  const tab = key(w, p.box, 'Tab'); // Tab chooses and lets focus move on
  assert.equal(tab.defaultPrevented, false);
  assert.deepEqual(state(p), { expanded: 'false', active: null, selected: ['classic-light'], shown: 'Classic Light' });
  assert.equal(key(w, p.box, 'Tab').defaultPrevented, false, 'Tab on the closed control is left alone');
});

test('keyboard: type-ahead opens on the first match and repeated letters cycle', () => {
  const w = page();
  const p = mount(w);
  key(w, p.box, 'c');
  assert.deepEqual([state(p).expanded, state(p).active], ['true', 'option-classic-light']);
  key(w, p.box, 'c');
  assert.equal(state(p).active, 'option-classic-dark');
  key(w, p.box, 'Escape');
  for (const c of 'classic d') key(w, p.box, c); // the space continues the typed text
  assert.equal(state(p).active, 'option-classic-dark');
  assert.equal(state(p).expanded, 'true');
});

test('pointer: the control toggles the list, an option chooses, a press outside closes', () => {
  const w = page();
  const p = mount(w);
  p.box.click();
  assert.equal(state(p).expanded, 'true');
  p.box.click();
  assert.equal(state(p).expanded, 'false');
  p.box.click();
  w.document.body.dispatchEvent(new w.Event('pointerdown', { bubbles: true, composed: true }));
  assert.equal(state(p).expanded, 'false', 'outside press closes');
  assert.deepEqual(state(p).selected, ['system']);
  p.box.click();
  p.opts[2].click();
  assert.deepEqual(state(p), { expanded: 'false', active: null, selected: ['classic-dark'], shown: 'Classic Dark' });
  assert.equal(w.localStorage.getItem(STORAGE_KEY), 'classic-dark');
});

test('a choice made elsewhere updates the control', () => {
  const w = page();
  const a = mount(w);
  const b = mount(w);
  key(w, a.box, 'End');
  key(w, a.box, 'Enter');
  assert.deepEqual(state(b).selected, ['classic-dark']);
  assert.equal(state(b).shown, 'Classic Dark');
});

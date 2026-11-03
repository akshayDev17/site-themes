// <site-theme-picker> in headless Chrome over CDP, in Classic Light and Classic
// Dark: the chevron's inner padding and the control's width at several type sizes, the open list drawn
// in the control's own type, colours, radius and border, the hover and keyboard
// highlight (contrast-checked from the computed colours), the APG keyboard
// model with real key events, and closing on a press outside. Each theme's open
// list is captured as a PNG; PICKER_SHOTS_DIR keeps the captures.
//
//   npm run build && npm run test:picker      (CHROME_PATH picks the browser)
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');
const build = JSON.parse(readFileSync(join(repo, 'shell/generated/build.json'), 'utf8'));
const siteJs = readFileSync(join(repo, `shell/public/_site/${build.id}/site.js`), 'utf8');
const scratch = mkdtempSync(join(tmpdir(), 'site-shell-picker-'));
const shots = process.env.PICKER_SHOTS_DIR || scratch;
mkdirSync(shots, { recursive: true });

/** A composed-like page: the head block, a header holding the picker at `size` px, site.js. */
function page(theme, size) {
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<script>try{localStorage.setItem('site-theme','${theme}')}catch(e){}</script>${build.inline}` +
    `<style>body{margin:0;background:var(--surface);color:var(--text);font:${size}px/1.4 Georgia,serif}` +
    'header{display:flex;justify-content:flex-end;padding:24px 40px 160px}</style></head><body>' +
    '<header><a href="#before">before</a>&nbsp;<site-theme-picker></site-theme-picker></header>' +
    `<script>${siteJs}</script></body></html>`;
  const file = join(scratch, `${theme}-${size}.html`);
  writeFileSync(file, html);
  return pathToFileURL(file).href;
}

let chrome;
before(async () => (chrome = await launchChrome()));
after(async () => {
  await chrome?.close();
  rmSync(scratch, { recursive: true, force: true });
});

async function open(theme, size = 16) {
  const tab = await chrome.newPage();
  await tab.call('Emulation.setDeviceMetricsOverride', { width: 640, height: 400, deviceScaleFactor: 2, mobile: false });
  await tab.call('Page.enable');
  await tab.call('Page.navigate', { url: page(theme, size) });
  for (let i = 0; i < 50 && (await tab.evaluate("document.readyState === 'complete' && customElements.get('site-theme-picker') !== undefined")) !== true; i++)
    await new Promise((r) => setTimeout(r, 100));
  const settle = () => tab.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const KEYS = { Tab: 9, Enter: 13, Escape: 27, ' ': 32, End: 35, Home: 36, ArrowUp: 38, ArrowDown: 40 };
  const press = async (key) => {
    const code = KEYS[key] ?? key.toUpperCase().charCodeAt(0);
    const text = key.length === 1 ? key : undefined;
    await tab.call('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: code, text });
    await tab.call('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code });
    await settle();
  };
  const mouse = async (type, x, y) => tab.call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
  const click = async (x, y) => {
    await mouse('mouseMoved', x, y);
    await mouse('mousePressed', x, y);
    await mouse('mouseReleased', x, y);
    await settle();
  };
  return { tab, settle, press, mouse, click, measure: () => tab.evaluate(MEASURE) };
}

// Everything the assertions read, from the live shadow root.
const MEASURE = `(() => {
  const host = document.querySelector('site-theme-picker'), root = host.shadowRoot;
  const box = root.querySelector('[role=combobox]'), list = root.querySelector('[role=listbox]');
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
  const cs = (el) => { const s = getComputedStyle(el); return { font: s.fontFamily, size: s.fontSize, spacing: s.letterSpacing, color: s.color, bg: s.backgroundColor,
    border: s.borderTopColor, borderWidth: s.borderTopWidth, radius: s.borderTopLeftRadius, shadow: s.boxShadow, outline: s.outlineStyle, outlineColor: s.outlineColor }; };
  const opts = [...root.querySelectorAll('[role=option]')];
  const active = opts.find((o) => o.classList.contains('active'));
  return {
    theme: document.documentElement.dataset.theme,
    tokens: { card: getComputedStyle(document.documentElement).getPropertyValue('--card').trim(), focus: getComputedStyle(document.documentElement).getPropertyValue('--focus').trim() },
    focused: root.activeElement === box, focusVisible: box.matches(':focus-visible'),
    expanded: box.getAttribute('aria-expanded'), activedescendant: box.getAttribute('aria-activedescendant'),
    listShown: list.matches(':popover-open') || !list.hidden && list.getBoundingClientRect().height > 0,
    box: { rect: rect(box), style: cs(box) },
    value: rect(box.querySelector('.value')), chevron: rect(box.querySelector('.chevron')),
    list: { rect: rect(list), style: cs(list) },
    options: opts.map((o) => ({ id: o.id, selected: o.getAttribute('aria-selected'), rect: rect(o), style: cs(o),
      check: getComputedStyle(o.querySelector('.check')).visibility })),
    active: active ? { id: active.id, style: cs(active) } : null,
  };
})()`;

// Computed colours come back as rgb()/rgba() or, for color-mix(), color(srgb r g b).
function rgb(css) {
  let m = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(css);
  if (m) return m.slice(1, 4).map(Number);
  m = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(css);
  if (m) return m.slice(1, 4).map((v) => Number(v) * 255);
  m = /^#([0-9a-f]{6})$/i.exec(css);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  throw new Error(`unparsed colour ${css}`);
}
const lum = (c) => rgb(c).map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// The highlight ring is an inset box-shadow: "<colour> 0px 0px 0px 2px inset".
const ringColour = (shadow) => /^(rgba?\([^)]*\)|color\([^)]*\))/.exec(shadow)?.[1];

for (const theme of ['classic-light', 'classic-dark']) {
  for (const size of [11, 13, 16, 20]) {
    test(`${theme} at ${size}px: the chevron sits 10-12px in from the right edge, centred, with the value clear of it`, async (t) => {
      const p = await open(theme, size);
      t.after(() => p.tab.close());
      const m = await p.measure();
      assert.equal(m.theme, theme);
      const inset = m.box.rect.right - m.chevron.right;
      assert.ok(inset >= 10 && inset <= 12.5, `chevron is ${inset}px from the right edge`);
      const centre = Math.abs((m.chevron.top + m.chevron.bottom) / 2 - (m.box.rect.top + m.box.rect.bottom) / 2);
      assert.ok(centre <= 1, `chevron is ${centre}px off the vertical centre`);
      assert.ok(m.chevron.left - m.value.right >= 6, `value ends ${m.chevron.left - m.value.right}px before the chevron`);
      assert.ok(m.box.rect.h >= 24, 'at least 24px tall');
      const widths = await p.tab.evaluate(`['system', 'classic-light', 'classic-dark'].map((id) => {
        dispatchEvent(new CustomEvent('site-theme-change', { detail: id }));
        return document.querySelector('site-theme-picker').shadowRoot.querySelector('[role=combobox]').getBoundingClientRect().width;
      })`);
      assert.ok(Math.max(...widths) - Math.min(...widths) < 0.5, `the control keeps one width whatever the choice (${widths.join(', ')})`);
    });
  }

  test(`${theme}: the keyboard opens a list in the control's own type, colours, radius and border, and chooses`, async (t) => {
    const p = await open(theme);
    t.after(() => p.tab.close());
    await p.tab.evaluate("document.querySelector('a').focus()");
    await p.press('Tab');
    let m = await p.measure();
    assert.ok(m.focused && m.focusVisible, 'Tab focuses the control, with a visible focus ring');
    assert.equal(m.box.style.outline, 'solid');
    assert.ok(contrast(m.box.style.outlineColor, m.box.style.bg) >= 3, 'the focus ring is at least 3:1 on the control');

    await p.press('ArrowDown');
    m = await p.measure();
    assert.equal(m.expanded, 'true');
    assert.ok(m.listShown, 'the list is shown');
    assert.equal(m.activedescendant, `option-${theme}`, 'opens on the chosen option');
    assert.ok(m.list.rect.top >= m.box.rect.bottom && m.list.rect.top - m.box.rect.bottom <= 6, 'the list opens just under the control');
    assert.ok(m.list.rect.w >= m.box.rect.w - 0.5, 'the list is at least as wide as the control');
    for (const k of ['font', 'size', 'spacing', 'color', 'bg', 'border', 'borderWidth', 'radius'])
      assert.equal(m.list.style[k], m.box.style[k], `list ${k} matches the control`);
    for (const o of m.options) {
      assert.equal(o.style.font, m.box.style.font, `${o.id} font`);
      assert.equal(o.style.size, m.box.style.size, `${o.id} size`);
    }
    // Selected: the check mark shows on the chosen option only.
    assert.deepEqual(m.options.map((o) => [o.id, o.selected, o.check]),
      [['option-system', 'false', 'hidden'], ['option-classic-light', String(theme === 'classic-light'), theme === 'classic-light' ? 'visible' : 'hidden'],
        ['option-classic-dark', String(theme === 'classic-dark'), theme === 'classic-dark' ? 'visible' : 'hidden']]);
    // Highlight: a wash that differs from the list, with a ring at 3:1 on the list and on the wash.
    const hl = m.active.style;
    assert.notEqual(rgb(hl.bg).join(), rgb(m.list.style.bg).join(), 'the highlight has its own background');
    const ring = ringColour(hl.shadow);
    assert.ok(ring, `the highlight has a ring (${hl.shadow})`);
    assert.ok(contrast(ring, m.list.style.bg) >= 3, `ring on the list ${contrast(ring, m.list.style.bg).toFixed(2)}:1`);
    assert.ok(contrast(ring, hl.bg) >= 3, `ring on the highlight ${contrast(ring, hl.bg).toFixed(2)}:1`);
    assert.ok(contrast(hl.color, hl.bg) >= 4.5, `text on the highlight ${contrast(hl.color, hl.bg).toFixed(2)}:1`);

    const { data } = await p.tab.call('Page.captureScreenshot', { format: 'png', clip: {
      x: m.list.rect.left - 120, y: m.box.rect.top - 16, width: m.list.rect.w + 160, height: m.list.rect.bottom - m.box.rect.top + 40, scale: 1 } });
    writeFileSync(join(shots, `open-list-${theme}.png`), Buffer.from(data, 'base64'));

    await p.press('End');
    assert.equal((await p.measure()).activedescendant, 'option-classic-dark');
    await p.press('Home');
    assert.equal((await p.measure()).activedescendant, 'option-system');
    await p.press('Escape');
    m = await p.measure();
    assert.equal(m.expanded, 'false');
    assert.equal(m.listShown, false);
    assert.equal(m.theme, theme, 'Escape changes nothing');
    assert.ok(m.focused, 'focus stays on the control');

    const other = theme === 'classic-light' ? 'classic-dark' : 'classic-light';
    await p.press('c'); // type-ahead starts after the chosen option: the other Classic theme
    await p.press('Enter');
    m = await p.measure();
    assert.equal(m.theme, other, 'type-ahead and Enter choose');
    assert.equal(await p.tab.evaluate("localStorage.getItem('site-theme')"), other);
    assert.equal(m.expanded, 'false');
  });

  test(`${theme}: in forced colours the keyboard highlight is still drawn, as a Highlight outline`, async (t) => {
    const p = await open(theme);
    t.after(() => p.tab.close());
    await p.tab.call('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    assert.equal(await p.tab.evaluate("matchMedia('(forced-colors: active)').matches"), true);
    await p.tab.evaluate("document.querySelector('a').focus()");
    await p.press('Tab');
    await p.press('ArrowDown');
    await p.press('ArrowDown');
    const m = await p.measure();
    assert.equal(m.active?.id, m.activedescendant, 'the keyboard moved the highlight');
    assert.equal(m.active.style.outline, 'solid', 'the highlighted option has an outline');
    const others = m.options.filter((o) => o.id !== m.active.id);
    for (const o of others) assert.equal(o.style.outline, 'none', `${o.id} has no outline`);
  });

  test(`${theme}: the pointer highlights the option under it, chooses on click, and a press outside closes`, async (t) => {
    const p = await open(theme);
    t.after(() => p.tab.close());
    let m = await p.measure();
    await p.click(m.box.rect.left + 5, m.box.rect.top + m.box.rect.h / 2);
    m = await p.measure();
    assert.equal(m.expanded, 'true');
    const system = m.options[0].rect;
    await p.mouse('mouseMoved', system.left + 10, system.top + system.h / 2);
    await p.settle();
    m = await p.measure();
    assert.equal(m.active.id, 'option-system', 'hover moves the highlight');
    await p.click(5, 395);
    m = await p.measure();
    assert.equal(m.expanded, 'false', 'a press outside closes');
    assert.equal(m.theme, theme, 'and chooses nothing');

    await p.click(m.box.rect.left + 5, m.box.rect.top + m.box.rect.h / 2);
    m = await p.measure();
    const target = m.options.find((o) => o.id !== `option-${theme}` && o.id !== 'option-system').rect;
    await p.click(target.left + 10, target.top + target.h / 2);
    m = await p.measure();
    assert.notEqual(m.theme, theme, 'a click on an option chooses it');
    assert.equal(m.expanded, 'false');
  });
}

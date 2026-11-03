// The site path's phone sheet stays on the screen of a portrait phone (390x844)
// even when the page is wider than the screen, in headless Chrome over CDP.
//
// A page wider than a phone's screen grows the layout viewport past the screen
// (here to about 580x1256), and the fixed sheet is placed in the layout
// viewport; the sheet must still sit inside the visual viewport, Close included,
// before and after the page is panned.
//
//   npm run build && npm run test:sheet      (CHROME_PATH picks the browser)
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sitePathMarkup } from '../../build/shell/nav.js';
import { launchChrome } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');
const build = JSON.parse(readFileSync(join(repo, 'shell/generated/build.json'), 'utf8'));
const siteJs = readFileSync(join(repo, `shell/public/_site/${build.id}/site.js`), 'utf8');
const scratch = mkdtempSync(join(tmpdir(), 'site-shell-sheet-'));
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };

/** A composed-like page with an artificially overflowing body: 580 px wide, 1300 px tall. */
function page(theme, withScript) {
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    // The stored choice goes in before the boot script reads it.
    `<script>try{localStorage.setItem('site-theme','${theme}')}catch(e){}</script>${build.inline}` +
    '<style>body{margin:0;background:var(--surface);color:var(--text)}.wide{width:580px;height:1300px}</style></head><body>' +
    `<header><site-slot name="site-path">${sitePathMarkup('chat')}</site-slot></header><div class="wide">wide content</div>` +
    (withScript ? `<script>${siteJs}</script>` : '') +
    '</body></html>';
  const file = join(scratch, `${theme}-${withScript ? 'js' : 'nojs'}.html`);
  writeFileSync(file, html);
  return pathToFileURL(file).href;
}

// Rectangles relative to the visual viewport (the screen), whatever the layout viewport.
const MEASURE = `(() => {
  const vv = visualViewport, d = document.getElementById('site-path-sheet');
  const rel = (el) => { const r = el.getBoundingClientRect();
    return { left: r.left - vv.offsetLeft, top: r.top - vv.offsetTop, right: r.right - vv.offsetLeft, bottom: r.bottom - vv.offsetTop }; };
  return { open: d.open, modal: d.matches(':modal'), vv: { x: vv.offsetLeft, y: vv.offsetTop, w: vv.width, h: vv.height },
    layout: { w: innerWidth, h: innerHeight }, theme: document.documentElement.dataset.theme,
    sheet: rel(d), close: rel(d.querySelector('.sp-close')) };
})()`;

const inside = (r, vv) => r.left >= -0.5 && r.top >= -0.5 && r.right <= vv.w + 0.5 && r.bottom <= vv.h + 0.5;

function assertOnScreen(m, what) {
  assert.equal(m.open && m.modal, true, `${what}: the sheet is open and modal`);
  assert.ok(inside(m.sheet, m.vv), `${what}: the sheet ${JSON.stringify(m.sheet)} is inside the screen ${JSON.stringify(m.vv)}`);
  assert.ok(inside(m.close, m.vv), `${what}: Close ${JSON.stringify(m.close)} is inside the screen ${JSON.stringify(m.vv)}`);
  assert.ok(Math.abs(m.sheet.bottom - m.vv.h) < 1, `${what}: the sheet sits on the screen's bottom edge (${m.sheet.bottom} vs ${m.vv.h})`);
  assert.ok(Math.abs(m.sheet.right - m.sheet.left - m.vv.w) < 1, `${what}: the sheet is the screen's width`);
}

let chrome;
before(async () => (chrome = await launchChrome()));
after(async () => {
  await chrome?.close();
  rmSync(scratch, { recursive: true, force: true });
});

async function openPhone(url) {
  const tab = await chrome.newPage();
  await tab.call('Emulation.setDeviceMetricsOverride', PHONE);
  await tab.call('Emulation.setTouchEmulationEnabled', { enabled: true });
  await tab.call('Page.enable');
  await tab.call('Page.navigate', { url });
  for (let i = 0; i < 50 && (await tab.evaluate('document.readyState')) !== 'complete'; i++) await new Promise((r) => setTimeout(r, 100));
  const settle = () => tab.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  // One axis per gesture: a diagonal touch drag locks to its main axis.
  const swipe = (x, y) =>
    tab.call('Input.synthesizeScrollGesture', { x: 200, y: 300, xDistance: -x, yDistance: -y, gestureSourceType: 'touch', speed: 2000 });
  const pan = async (x, y) => {
    if (x) await swipe(x, 0);
    if (y) await swipe(0, y);
    await settle();
  };
  const tapPill = async () => {
    await tab.evaluate("document.querySelector('.sp-pill').click()");
    await settle();
  };
  return { tab, settle, pan, tapPill, measure: () => tab.evaluate(MEASURE) };
}

for (const theme of ['classic-light', 'classic-dark']) {
  test(`${theme}: on an overflowing page the sheet and Close are on the screen, before and after panning`, async (t) => {
    const p = await openPhone(page(theme, true));
    t.after(() => p.tab.close());
    const first = await p.measure();
    assert.equal(first.theme, theme);
    assert.ok(first.layout.w > PHONE.width + 100 && first.layout.h > PHONE.height + 100, `the page overflows the phone: layout viewport ${JSON.stringify(first.layout)}`);

    await p.tapPill();
    assertOnScreen(await p.measure(), 'opened at the top left');
    await p.tab.evaluate("document.querySelector('.sp-close').click()");
    await p.settle();
    assert.equal((await p.measure()).open, false, 'Close closes the sheet');

    // Pan right and down to the far corner, then open.
    await p.pan(400, 1500);
    const panned = await p.measure();
    assert.ok(panned.vv.x > 100 && panned.vv.y > 100, `the screen was panned within the layout viewport: ${JSON.stringify(panned.vv)}`);
    await p.tapPill();
    assertOnScreen(await p.measure(), 'opened after panning right and down');

    // Pan back while it is open.
    await p.pan(-400, -1500);
    assertOnScreen(await p.measure(), 'panned back while open');
    await p.tab.evaluate("document.querySelector('.sp-close').click()");
    await p.settle();
    assert.equal((await p.measure()).open, false, 'Close still closes the sheet');
  });
}

test('without site.js (CSS alone), the unpanned sheet and Close are on the screen of an overflowing page', async (t) => {
  const p = await openPhone(page('classic-light', false));
  t.after(() => p.tab.close());
  // Invoker commands open it with no script; showModal() where they are missing.
  await p.tab.evaluate("const d = document.getElementById('site-path-sheet'); document.querySelector('.sp-pill').click(); if (!d.open) d.showModal()");
  await p.settle();
  assertOnScreen(await p.measure(), 'CSS alone');
});

// Pinch-zoomed in, the screen is a narrower visual viewport (195 CSS px at 2x on
// this phone) and site.js narrows the sheet to it; the sheet's head wraps so
// Close stays on the screen rather than past its right edge.
for (const scale of [1.5, 2]) {
  test(`pinch-zoomed ${scale}x on an overflowing page, the sheet and Close are on the screen`, async (t) => {
    const p = await openPhone(page('classic-light', true));
    t.after(() => p.tab.close());
    await p.tab.call('Input.synthesizePinchGesture', { x: 195, y: 400, scaleFactor: scale, gestureSourceType: 'touch' });
    await p.settle();
    const zoomed = await p.measure();
    assert.ok(Math.abs(zoomed.vv.w - PHONE.width / scale) < 2, `the page is zoomed ${scale}x: ${JSON.stringify(zoomed.vv)}`);
    await p.tapPill();
    const m = await p.measure();
    assertOnScreen(m, `pinch-zoomed ${scale}x`);
    const sheetScroll = await p.tab.evaluate("(() => { const d = document.getElementById('site-path-sheet'); return d.scrollWidth - d.clientWidth })()");
    assert.ok(sheetScroll <= 0, `the sheet does not scroll sideways (${sheetScroll}px)`);
  });
}

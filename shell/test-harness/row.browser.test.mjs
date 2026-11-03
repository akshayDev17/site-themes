// The site row and its trail in headless Chrome over CDP, at a desktop
// (1440x900, 1280x800), a landscape phone (844x390) and a portrait phone
// (390x844), in both themes:
// - the row is one line of 44 px targets with the current app marked and in
//   view; it sits inline where it fits and scrolls sideways where it does not,
//   with the edge that has more apps past it faded;
// - the trail is its own line under the row;
// - the row adds no sideways scroll to the page, even in a box sized by its
//   content;
// - the text meets 4.5:1 against the page.
//
//   npm run build && npm run test:row      (CHROME_PATH picks the browser;
//   ROW_SHOTS=<dir> also saves a page capture of every case there)
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const scratch = mkdtempSync(join(tmpdir(), 'site-shell-row-'));
const shots = process.env.ROW_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const SIZES = {
  '1440': { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  '1280': { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
  '844x390': { width: 844, height: 390, deviceScaleFactor: 3, mobile: true },
  '390x844': { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
};
const THEMES = ['classic-light', 'classic-dark'];

// Pages shaped like the apps' own: a 16 px gutter, the slot at the top of the
// page head, and (for the homepage) the theme picker beside the row on a phone.
const PAGES = {
  home: { app: 'home', tail: [], current: 'Home', head: (slot) => `<div class="topline">${slot}<site-theme-picker hide-label></site-theme-picker></div><h1>Akshay Prabhakant</h1>` },
  'quiz-history': { app: 'quiz', tail: [{ label: 'History' }], current: 'Quiz Room', head: (slot) => `${slot}<h1>History</h1>` },
  'atlas-state': {
    app: 'atlas',
    tail: [{ label: 'India', href: '/elections/india/' }, { label: 'Uttar Pradesh' }],
    current: 'Election Atlas',
    head: (slot) => `${slot}<h1>Election Atlas of Uttar Pradesh</h1>`,
  },
  // A box sized by its content (an inline-block head) gives the row no width to scroll in; it must still keep to the screen.
  'content-sized': { app: 'atlas', tail: [], current: 'Election Atlas', head: (slot) => `<div style="display:inline-block">${slot}</div>` },
};

function page(name, theme) {
  const { app, tail, head } = PAGES[name];
  const slot = `<site-slot name="site-path" data-tail='${JSON.stringify(tail)}'>${sitePathMarkup(app, tail)}</site-slot>`;
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    // The stored choice goes in before the boot script reads it.
    `<script>try{localStorage.setItem('site-theme','${theme}')}catch(e){}</script>${build.inline}` +
    '<style>body{margin:0;padding:16px;background:var(--surface);color:var(--text);font-family:var(--font-serif,Georgia,serif)}' +
    '.topline{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:44px}.topline site-slot{flex:1 1 auto;min-width:0}' +
    'h1{font-weight:400;font-size:26px;margin:16px 0}</style></head><body>' +
    `<header>${head(slot)}</header><main><p>Page content.</p></main>` +
    `<script>${siteJs}</script></body></html>`;
  const file = join(scratch, `${name}-${theme}.html`);
  writeFileSync(file, html);
  return pathToFileURL(file).href;
}

const MEASURE = `(() => {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const row = document.querySelector('.sp-apps');
  const links = [...row.querySelectorAll('a')];
  const current = row.querySelector('[aria-current]');
  const trail = document.querySelector('.sp-trail');
  const slot = document.querySelector('site-slot');
  const bg = getComputedStyle(document.body).backgroundColor;
  return {
    theme: document.documentElement.dataset.theme,
    page: { scrollWidth: document.documentElement.scrollWidth, innerWidth },
    row: { ...rect(row), scrollWidth: row.scrollWidth, clientWidth: row.clientWidth, scrollLeft: row.scrollLeft,
      more: row.dataset.more ?? null, mask: getComputedStyle(row).maskImage || getComputedStyle(row).webkitMaskImage },
    links: links.map((a) => ({ text: a.querySelector('.sp-label')?.textContent ?? a.firstChild.textContent, ...rect(a),
      color: getComputedStyle(a).color })),
    current: current && { text: current.querySelector('.sp-label').textContent, ...rect(current), color: getComputedStyle(current).color,
      underline: getComputedStyle(current.querySelector('.sp-label')).textDecorationLine },
    // The "›" between crumbs is CSS ::before content, which innerText leaves out; read it back from the second crumb on.
    trail: trail && { ...rect(trail), text: [...trail.querySelectorAll('li')].map((li, i) =>
        (i ? JSON.parse(getComputedStyle(li, '::before').content) + ' ' : '') + li.textContent).join(' '),
      colors: [...trail.querySelectorAll('a, [aria-current]')].map((el) => getComputedStyle(el).color) },
    locks: slot.querySelectorAll('svg, .site-lock').length,
    bg,
  };
})()`;

/** WCAG relative-luminance contrast of two computed rgb() colours. */
function contrast(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let chrome;
before(async () => (chrome = await launchChrome()));
after(async () => {
  await chrome?.close();
  rmSync(scratch, { recursive: true, force: true });
});

async function open(url, size) {
  const tab = await chrome.newPage();
  await tab.call('Emulation.setDeviceMetricsOverride', SIZES[size]);
  if (SIZES[size].mobile) await tab.call('Emulation.setTouchEmulationEnabled', { enabled: true });
  await tab.call('Page.enable');
  await tab.call('Page.navigate', { url });
  for (let i = 0; i < 50 && (await tab.evaluate('document.readyState')) !== 'complete'; i++) await new Promise((r) => setTimeout(r, 100));
  const settle = () => tab.evaluate('document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))');
  await settle();
  return { tab, settle, measure: () => tab.evaluate(MEASURE) };
}

async function shoot(tab, name) {
  if (!shots) return;
  const { data } = await tab.call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(shots, `${name}.png`), Buffer.from(data, 'base64'));
}

const near = (a, b) => Math.abs(a - b) < 1;

for (const theme of THEMES) {
  for (const size of Object.keys(SIZES)) {
    for (const name of ['home', 'quiz-history', 'atlas-state']) {
      test(`${theme} ${size} ${name}: one row of 44 px targets, current app marked and in view, trail on its own line, no page overflow`, async (t) => {
        const p = await open(page(name, theme), size);
        t.after(() => p.tab.close());
        const m = await p.measure();
        await shoot(p.tab, `${name}-${size}-${theme}`);

        assert.equal(m.theme, theme);
        assert.equal(m.locks, 0, 'no lock glyph');
        assert.deepEqual(m.links.map((l) => l.text), ['Home', 'AI Digest', 'Quiz Room', 'Graph Notes', 'Election Atlas']);
        for (const l of m.links) assert.ok(l.height >= 44 && l.width >= 44, `${l.text}: a 44 px target (${l.width}x${l.height})`);
        assert.ok(m.links.every((l) => near(l.top, m.links[0].top)), 'one line: every app on the same line');
        assert.ok(m.page.scrollWidth <= m.page.innerWidth, `no sideways page scroll: ${JSON.stringify(m.page)}`);

        // The current app: in ink, underlined, and wholly inside the row's visible box.
        assert.equal(m.current.text, PAGES[name].current);
        assert.equal(m.current.underline, 'underline');
        assert.ok(m.current.left >= m.row.left - 0.5 && m.current.right <= m.row.right + 0.5, `the current app is in view: ${JSON.stringify(m.current)} in ${JSON.stringify(m.row)}`);

        const fits = m.row.scrollWidth <= m.row.clientWidth;
        if (size === '390x844') {
          assert.ok(!fits, 'on a portrait phone the five names do not fit: the row scrolls');
          assert.ok(m.row.more, 'the edge with apps past it is marked');
          assert.notEqual(m.row.mask, 'none', 'and faded');
          if (name === 'atlas-state') assert.match(m.row.more, /start/, 'the atlas, last in the row, is scrolled into view');
          if (name === 'home') assert.equal(m.row.more, 'end', 'on the homepage the row starts at Home');
        } else {
          assert.ok(fits, `the row sits inline where it fits (${m.row.scrollWidth} in ${m.row.clientWidth})`);
          assert.equal(m.row.more, null, 'nothing to fade');
          for (const l of m.links) assert.ok(l.right <= m.row.right + 0.5, `${l.text} is wholly visible`);
        }

        if (name === 'home') assert.equal(m.trail, null, 'no trail at an app root');
        else {
          assert.ok(m.trail.top >= m.row.bottom - 0.5, `the trail is under the row, not beside it: ${m.trail.top} vs ${m.row.bottom}`);
          assert.ok(m.trail.bottom - m.trail.top < 40, 'the trail is one line');
          assert.equal(m.trail.text, name === 'quiz-history' ? 'Quiz Room › History' : 'Election Atlas › India › Uttar Pradesh');
        }

        for (const [what, color] of [...m.links.map((l) => [l.text, l.color]), ...(m.trail?.colors ?? []).map((c) => ['trail', c])]) {
          const ratio = contrast(color, m.bg);
          assert.ok(ratio >= 4.5, `${what}: ${color} on ${m.bg} is ${ratio.toFixed(2)}:1`);
        }
      });
    }
  }

  test(`${theme} 390x844: the fade follows the row as it is scrolled, and a redrawn row is picked up again`, async (t) => {
    const p = await open(page('home', theme), '390x844');
    t.after(() => p.tab.close());
    assert.equal((await p.measure()).row.more, 'end');
    await p.tab.evaluate("(() => { const r = document.querySelector('.sp-apps'); r.scrollLeft = r.scrollWidth; })()");
    await p.settle();
    assert.equal((await p.measure()).row.more, 'start', 'scrolled to the end: only the start is faded');
    await p.tab.evaluate("(() => { const r = document.querySelector('.sp-apps'); r.scrollLeft = 40; })()");
    await p.settle();
    assert.equal((await p.measure()).row.more, 'start end');
    await shoot(p.tab, `home-390x844-scrolled-${theme}`);

    // An app's client-side navigation redraws the slot: the new row is marked too.
    await p.tab.evaluate("(() => { const s = document.querySelector('site-slot'); s.innerHTML = s.innerHTML; })()");
    await p.settle();
    const redrawn = await p.measure();
    assert.equal(redrawn.row.more, 'end', 'the redrawn row is marked');
  });
}

for (const size of Object.keys(SIZES)) {
  test(`${size}: in a box sized by its content, the row still keeps to the screen`, async (t) => {
    const p = await open(page('content-sized', 'classic-light'), size);
    t.after(() => p.tab.close());
    const m = await p.measure();
    assert.ok(m.page.scrollWidth <= m.page.innerWidth, `no sideways page scroll: ${JSON.stringify(m.page)}`);
    assert.ok(m.current.right <= m.page.innerWidth, 'the current app is on the screen');
  });
}

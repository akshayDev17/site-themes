// The markup compose() puts into <site-slot>s (shell/nav.ts), parsed with jsdom:
// structure, aria-current, accessible names and the listed:false behaviour.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { APPS, type App } from '../src/apps.js';
import { SHEET_ID, isUnlisted, parseTail, siteAppsMarkup, sitePathMarkup, slotMarkup, type Crumb } from '../shell/nav.js';

const GATED = '(invite-only, sign-in required)';

function render(html: string | null) {
  assert.ok(html, 'markup rendered');
  const doc = new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
  const nav = doc.querySelector('nav')!;
  return {
    doc,
    nav,
    row: [...doc.querySelectorAll('.sp-apps > li > *')],
    pill: doc.querySelector('.sp-pill')!,
    sheet: doc.querySelector('dialog')!,
    sheetRows: [...doc.querySelectorAll('dialog li a')],
    css: [...doc.querySelector('style')!.sheet!.cssRules],
  };
}

/** The accessible name as a screen reader computes it here: aria-label, else text without aria-hidden parts. */
function accessibleName(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label !== null) return label;
  const walk = (n: Node): string => {
    if (n.nodeType === 3) return n.textContent ?? '';
    if (n.nodeType !== 1 || (n as Element).getAttribute('aria-hidden') === 'true') return '';
    return [...n.childNodes].map(walk).join('');
  };
  return walk(el).replace(/\s+/g, ' ').trim();
}

/** The text shown on screen: everything but the visually hidden parts. */
const visibleText = (el: Element) =>
  [...el.childNodes].filter((n) => !(n.nodeType === 1 && (n as Element).classList.contains('site-vh'))).map((n) => n.textContent).join('').trim();

const unlisted = (id: string): App[] => APPS.map((a) => (a.id === id ? { ...a, listed: false } : a));

test('the site path is a labelled nav: the site name goes home, then the five apps inline, in list order', () => {
  const { nav, row } = render(sitePathMarkup('atlas'));
  assert.equal(nav.getAttribute('aria-label'), 'Site path');
  const home = [...nav.querySelectorAll(':scope > a')];
  assert.deepEqual(home.map((a) => a.getAttribute('href')), ['/', '/']);
  assert.deepEqual(row.map((el) => visibleText(el).replace(/\s+/g, ' ')), ['Portfolio', 'AI Digest', 'Quiz Room', 'Graph Notes', 'Election Atlas']);
  assert.deepEqual(row.map((el) => el.getAttribute('href')), ['/', '/chat-archives', '/quiz', '/graph/', null]);
});

test('the home link has a proper accessible name at both widths, starting with what it shows', () => {
  const { nav } = render(sitePathMarkup('chat'));
  const long = nav.querySelector('.sp-long')!;
  const short = nav.querySelector('.sp-short')!;
  assert.equal(accessibleName(long), 'akshayprabhakant.com home');
  assert.equal(accessibleName(short), 'AP, akshayprabhakant.com home');
  // WCAG 2.5.3 Label in Name: the name starts with the visible label.
  assert.ok(accessibleName(long).startsWith(visibleText(long)));
  assert.ok(accessibleName(short).startsWith(short.textContent!));
});

test('at the app root, the current app is plain text with aria-current="page"', () => {
  const { nav, row } = render(sitePathMarkup('atlas'));
  const here = row[4];
  assert.equal(here.tagName, 'SPAN');
  assert.equal(here.getAttribute('aria-current'), 'page');
  assert.equal(nav.querySelectorAll('[aria-current="page"]').length, 1);
  for (const el of row.slice(0, 4)) assert.equal(el.getAttribute('aria-current'), null);
});

test('deeper in the app, the app links to its root and the last crumb is the current page as plain text', () => {
  const tail: Crumb[] = [
    { label: 'India', href: '/elections/india/' },
    { label: 'Uttar Pradesh', href: '/elections/india/state/?s=IN-UP' },
  ];
  const { nav, row } = render(sitePathMarkup('atlas', tail));
  const app = row[4];
  assert.equal(app.tagName, 'A');
  assert.equal(app.getAttribute('href'), '/elections/india/');
  assert.equal(app.getAttribute('aria-current'), 'true');
  const crumbs = [...nav.querySelectorAll('.sp-crumb')];
  assert.equal(crumbs.length, 2);
  assert.equal(crumbs[0].querySelector('a')!.getAttribute('href'), '/elections/india/');
  const last = crumbs[1].querySelector('[aria-current]')!;
  assert.equal(last.tagName, 'SPAN', 'the current page is not a link');
  assert.equal(last.getAttribute('aria-current'), 'page');
  assert.equal(last.textContent, 'Uttar Pradesh');
  assert.equal(nav.querySelectorAll('[aria-current="page"]').length, 1, 'aria-current="page" only on the true current page');
  for (const sep of nav.querySelectorAll('.sp-sep')) assert.equal(sep.getAttribute('aria-hidden'), 'true');
});

test('gated apps carry an aria-hidden lock and the text alternative', () => {
  const { row, sheetRows } = render(sitePathMarkup('home'));
  for (const el of [row[2], row[3], sheetRows[2], sheetRows[3]]) {
    assert.ok(accessibleName(el).includes(GATED), accessibleName(el));
    assert.equal(el.querySelector('svg')!.getAttribute('aria-hidden'), 'true');
  }
  for (const el of [row[1], row[4]]) assert.ok(!accessibleName(el).includes(GATED));
});

test('the phone pill names the current app, hides its chevron, and opens the sheet as a modal dialog', () => {
  const { pill, sheet } = render(sitePathMarkup('atlas'));
  assert.equal(pill.tagName, 'BUTTON');
  assert.equal(pill.getAttribute('type'), 'button');
  assert.equal(accessibleName(pill), 'Election Atlas, switch app');
  assert.equal(pill.querySelector('.sp-chev')!.getAttribute('aria-hidden'), 'true');
  assert.equal(pill.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(pill.getAttribute('commandfor'), SHEET_ID);
  assert.equal(pill.getAttribute('command'), 'show-modal');
  assert.equal(sheet.id, SHEET_ID);
  assert.equal(sheet.getAttribute('aria-label'), 'Apps on akshayprabhakant.com');
  assert.equal(sheet.getAttribute('closedby'), 'any');
  const close = sheet.querySelector('button.sp-close')!;
  assert.equal(close.textContent, 'Close', 'a visible Close button');
  assert.equal(close.getAttribute('commandfor'), SHEET_ID);
  assert.equal(close.getAttribute('command'), 'close');
});

test('the sheet lists the apps with their blurbs and marks the current one "You are here"', () => {
  const { sheetRows } = render(sitePathMarkup('atlas'));
  assert.deepEqual(sheetRows.map((a) => a.querySelector('.sp-blurb')!.textContent), APPS.map((a) => a.blurb));
  const here = sheetRows.filter((a) => a.hasAttribute('aria-current'));
  assert.equal(here.length, 1);
  assert.equal(here[0].getAttribute('href'), '/elections/india/');
  assert.equal(here[0].getAttribute('aria-current'), 'page');
  assert.equal(here[0].querySelector('.sp-here-tag')!.textContent, 'You are here');
  // Deeper in the app the row still links to the app's root, as the current location rather than the page.
  const deep = render(sitePathMarkup('atlas', [{ label: 'India' }])).sheetRows[4];
  assert.equal(deep.getAttribute('aria-current'), 'true');
});

test('on the homepage the switcher reads "Portfolio"', () => {
  const { row, pill } = render(sitePathMarkup('home'));
  assert.equal(row[0].textContent, 'Portfolio');
  assert.equal(row[0].getAttribute('aria-current'), 'page');
  assert.equal(accessibleName(pill), 'Portfolio, switch app');
});

test('listed:false: the app says "Not listed" on its own switcher and is absent from every other one', () => {
  const apps = unlisted('graph');
  assert.equal(isUnlisted('graph', apps), true);
  assert.equal(isUnlisted('graph'), false);
  assert.equal(isUnlisted('nope', apps), false);

  const own = render(sitePathMarkup('graph', [], apps));
  assert.equal(own.row.length, 5);
  assert.equal(accessibleName(own.row[3]), `Graph Notes ${GATED}, Not listed`);
  assert.equal(own.row[3].getAttribute('aria-current'), 'page');
  assert.equal(own.sheetRows[3].querySelector('.sp-here-tag')!.textContent, 'You are here · Not listed');

  for (const id of ['home', 'chat', 'quiz', 'atlas']) {
    const other = render(sitePathMarkup(id, [], apps));
    assert.equal(other.row.length, 4, id);
    assert.equal(other.sheetRows.length, 4, id);
    assert.equal(other.doc.querySelector('[href="/graph/"]'), null, id);
    assert.ok(!other.doc.body.textContent!.includes('Graph Notes'), id);
    assert.ok(!other.doc.body.textContent!.includes('Not listed'), id);
  }
  const list = new JSDOM(siteAppsMarkup(apps)).window.document;
  assert.deepEqual([...list.querySelectorAll('li')].map((li) => li.getAttribute('data-app')), ['chat', 'quiz', 'atlas']);
});

test('the slot styles: Newsreader at 15 px in sentence case, 44 px targets, the folds at 900 and 640 px', () => {
  const { css } = render(sitePathMarkup('atlas'));
  const styleRules = (rules: CSSRule[]) => rules.filter((r): r is CSSStyleRule => 'selectorText' in r);
  const rule = (rules: CSSRule[], selector: string) => {
    const found = styleRules(rules).find((r) => r.selectorText === selector);
    assert.ok(found, selector);
    return found.style;
  };
  const media = (query: string) => {
    const found = css.find((r): r is CSSMediaRule => 'media' in r && (r as CSSMediaRule).media.mediaText === query);
    assert.ok(found, query);
    return [...found.cssRules];
  };
  const declarations = [css, ...css.filter((r): r is CSSMediaRule => 'media' in r).map((r) => [...r.cssRules])]
    .flatMap(styleRules)
    .flatMap((r) => Array.from({ length: r.style.length }, (_, i) => r.style.getPropertyValue(r.style[i])));

  const sp = rule(css, '.sp');
  assert.equal(sp.getPropertyValue('font'), '400 15px/1.3 var(--font-serif,Georgia,serif)');
  assert.equal(sp.getPropertyValue('text-transform'), 'none');
  assert.ok(!declarations.some((v) => /font-mono|uppercase/.test(v)), 'no mono or uppercase anywhere');

  const target = rule(css, '.sp a,.sp-here');
  assert.equal(target.getPropertyValue('min-height'), '44px');
  assert.equal(target.getPropertyValue('min-width'), '44px');
  // The pill: drawn 34 px tall (1 px borders included); its ::before sits on the 32 px padding box, so it is tapped over 32 + 2 × 6 = 44 px.
  const pill = rule(css, '.sp-pill');
  assert.equal(pill.getPropertyValue('position'), 'relative');
  assert.equal(pill.getPropertyValue('box-sizing'), 'border-box');
  assert.equal(pill.getPropertyValue('min-height'), '34px');
  const tap = rule(css, '.sp-pill::before');
  assert.equal(tap.getPropertyValue('content'), '""');
  assert.equal(tap.getPropertyValue('position'), 'absolute');
  assert.equal(tap.getPropertyValue('inset'), '-6px -1px');
  assert.equal(rule(css, '.sp-close').getPropertyValue('min-height'), '44px');

  const at900 = media('(max-width:900px)');
  assert.deepEqual([rule(at900, '.sp-long').getPropertyValue('display'), rule(at900, '.sp-long').getPropertyPriority('display')], ['none', 'important']);
  assert.deepEqual([rule(at900, '.sp-short').getPropertyValue('display'), rule(at900, '.sp-short').getPropertyPriority('display')], ['inline-flex', 'important']);
  const at640 = media('(max-width:640px)');
  assert.deepEqual([rule(at640, '.sp-apps').getPropertyValue('display'), rule(at640, '.sp-apps').getPropertyPriority('display')], ['none', 'important']);
  assert.equal(rule(at640, '.sp-pill').getPropertyValue('display'), 'inline-flex');
  assert.equal(rule(at640, '.sp-crumb:not(:last-child)').getPropertyValue('display'), 'none');

  assert.equal(rule(css, '.sp .sp-app[aria-current]').getPropertyValue('color'), 'var(--text)');
  assert.ok(!declarations.some((v) => v.includes('var(--accent)')), 'the current app is marked in ink, never accent');
});

test('the homepage list: the listed apps other than Portfolio, gated ones marked', () => {
  const doc = new JSDOM(siteAppsMarkup()).window.document;
  const items = [...doc.querySelectorAll('ul.site-apps > li')];
  assert.deepEqual(items.map((li) => li.getAttribute('data-app')), ['chat', 'quiz', 'graph', 'atlas']);
  assert.deepEqual(items.map((li) => li.hasAttribute('data-gated')), [false, true, true, false]);
  assert.deepEqual(items.map((li) => li.querySelector('a')!.getAttribute('href')), ['/chat-archives', '/quiz', '/graph/', '/elections/india/']);
  assert.ok(accessibleName(items[1].querySelector('a')!).includes(GATED));
});

test('the tail: escaped text, same-site links only, and anything malformed throws', () => {
  assert.deepEqual(parseTail(null), []);
  assert.deepEqual(parseTail(''), []);
  assert.deepEqual(parseTail('[{"label":"India","href":"/elections/india/"},{"label":"UP"}]'), [
    { label: 'India', href: '/elections/india/' },
    { label: 'UP' },
  ]);
  const bad = ['{', '{}', '"India"', '[{}]', '[{"label":""}]', '[{"label":1}]', '[null]',
    '[{"label":"x","href":"javascript:alert(1)"}]', '[{"label":"x","href":"//evil.example/"}]',
    '[{"label":"x","href":"/\\\\evil.example/"}]', '[{"label":"x","href":"https://evil.example/"}]', '[{"label":"x","href":"/a b"}]'];
  for (const raw of bad) assert.throws(() => parseTail(raw), Error, raw);

  const evil = '<img src=x onerror=alert(1)>"\'&';
  const { doc, nav } = render(sitePathMarkup('chat', [{ label: evil, href: '/chat-archives/?q="x"' }, { label: evil }]));
  assert.equal(doc.querySelector('img'), null);
  assert.equal(nav.querySelector('.sp-crumb a')!.getAttribute('href'), '/chat-archives/?q="x"');
  assert.equal(nav.querySelector('.sp-crumb [aria-current]')!.textContent, evil);
});

test('slotMarkup: site-path reads data-tail, site-apps renders the list, anything else (or an unknown app) is left alone', () => {
  const attrs: Record<string, string> = { 'data-tail': '[{"label":"India"}]' };
  const attr = (n: string) => attrs[n] ?? null;
  assert.equal(slotMarkup('site-path', attr, 'atlas'), sitePathMarkup('atlas', [{ label: 'India' }]));
  assert.equal(slotMarkup('site-apps', attr, 'home'), siteAppsMarkup());
  assert.equal(slotMarkup('site-menu', attr, 'atlas'), null);
  assert.equal(slotMarkup('site-path', attr, 'nope'), null);
  assert.equal(sitePathMarkup('nope'), null);
  assert.throws(() => slotMarkup('site-path', () => 'not json', 'atlas'));
});

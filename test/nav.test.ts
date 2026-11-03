// The markup compose() puts into <site-slot>s (shell/nav.ts), parsed with jsdom:
// structure, aria-current, accessible names and the listed:false behaviour.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { APPS, type App } from '../src/apps.js';
import { GATED_TEXT, isUnlisted, listedAppsJson, parseTail, siteAppsMarkup, sitePathMarkup, slotMarkup, trailOf, type Crumb } from '../shell/nav.js';

const GATED = GATED_TEXT.trim();

function render(html: string | null) {
  assert.ok(html, 'markup rendered');
  const doc = new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
  return {
    doc,
    nav: doc.querySelector('nav.sp')!,
    row: [...doc.querySelectorAll('nav.sp > ul.sp-apps > li > a')],
    trail: doc.querySelector('nav.sp-trail'),
    crumbs: [...doc.querySelectorAll('nav.sp-trail > ol > li')],
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
const visibleText = (el: Element): string =>
  [...el.childNodes]
    .map((n) => (n.nodeType === 3 ? n.textContent : n.nodeType === 1 && !(n as Element).classList.contains('site-vh') ? visibleText(n as Element) : ''))
    .join('')
    .trim();

const unlisted = (id: string): App[] => APPS.map((a) => (a.id === id ? { ...a, listed: false } : a));
const app = (id: string) => APPS.find((a) => a.id === id)!;
const STATE_TAIL: Crumb[] = [{ label: 'India', href: '/elections/india/' }, { label: 'Uttar Pradesh' }];

test('the site row is just the five apps, in list order, each a link to its root: no site name, no "Portfolio" crumb', () => {
  const { doc, nav, row } = render(sitePathMarkup('atlas'));
  assert.equal(nav.getAttribute('aria-label'), 'Site');
  assert.deepEqual(row.map(visibleText), ['Home', 'AI Digest', 'Quiz Room', 'Graph Notes', 'Election Atlas']);
  assert.deepEqual(row.map((a) => a.getAttribute('href')), ['/', '/chat-archives', '/quiz', '/graph/', '/elections/']);
  assert.equal(nav.children.length, 1, 'the row is the only thing in the site nav');
  const shown = [...doc.querySelectorAll('nav')].map((n) => n.textContent).join('');
  assert.ok(!shown.includes('akshayprabhakant.com'), 'no site name');
  assert.ok(!shown.includes('Portfolio'));
  assert.ok(!shown.includes('/'), 'no "/" separators');
});

test('no lock anywhere: gated apps carry only a visually hidden "(sign-in required)"', () => {
  for (const html of [sitePathMarkup('home'), sitePathMarkup('quiz', [{ label: 'History' }]), siteAppsMarkup()]) {
    const doc = new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
    assert.equal(doc.querySelectorAll('svg, .site-lock').length, 0, 'no lock glyph');
    assert.ok(!/site-lock|<svg|🔒/.test(html!), 'no lock in the markup or its CSS');
    for (const vh of doc.querySelectorAll('.site-vh')) {
      if (vh.textContent!.includes('sign-in')) assert.equal(vh.textContent, ' (sign-in required)');
    }
  }
  const { row } = render(sitePathMarkup('home'));
  assert.deepEqual(row.map(accessibleName), ['Home', 'AI Digest', `Quiz Room ${GATED}`, `Graph Notes ${GATED}`, 'Election Atlas']);
  assert.deepEqual(row.map(visibleText), ['Home', 'AI Digest', 'Quiz Room', 'Graph Notes', 'Election Atlas'], 'nothing extra is drawn');
  // WCAG 2.5.3 Label in Name: the name starts with the visible label.
  for (const a of row) assert.ok(accessibleName(a).startsWith(visibleText(a)));
});

test('at the app root, the current app is marked aria-current="page" and there is no trail', () => {
  const { doc, row, trail } = render(sitePathMarkup('atlas'));
  assert.equal(row[4].getAttribute('aria-current'), 'page');
  assert.equal(row[4].querySelector('.sp-label')!.textContent, 'Election Atlas');
  for (const el of row.slice(0, 4)) assert.equal(el.getAttribute('aria-current'), null);
  assert.equal(trail, null);
  assert.equal(doc.querySelectorAll('[aria-current="page"]').length, 1);
});

test('on the homepage the row reads "Home", marked as the current page', () => {
  const { row } = render(sitePathMarkup('home'));
  assert.equal(visibleText(row[0]), 'Home');
  assert.equal(row[0].getAttribute('href'), '/');
  assert.equal(row[0].getAttribute('aria-current'), 'page');
});

test('deeper in an app, the page name goes on its own line under the row, never into it', () => {
  const { doc, nav, row, trail, crumbs } = render(sitePathMarkup('quiz', [{ label: 'History' }]));
  assert.deepEqual(row.map(visibleText), ['Home', 'AI Digest', 'Quiz Room', 'Graph Notes', 'Election Atlas'], 'the row is unchanged');
  assert.ok(!nav.textContent!.includes('History'), 'the page name is not in the row');
  assert.equal(row[2].getAttribute('aria-current'), 'true', 'the app is the current location, not the page');
  assert.ok(trail, 'a trail');
  assert.equal(nav.nextElementSibling, trail, 'the trail is a sibling after the row, not inside it');
  assert.equal(trail.getAttribute('aria-label'), 'Breadcrumb');
  assert.deepEqual(crumbs.map((li) => li.textContent), ['Quiz Room', 'History']);
  assert.equal(crumbs[0].querySelector('a')!.getAttribute('href'), '/quiz');
  const here = crumbs[1].firstElementChild!;
  assert.equal(here.tagName, 'SPAN', 'the current page is not a link');
  assert.equal(here.getAttribute('aria-current'), 'page');
  assert.equal(doc.querySelectorAll('[aria-current="page"]').length, 1, 'aria-current="page" only on the true current page');
});

test('Election Atlas links to /elections/ and is the current app there and on every country page', () => {
  const root = render(sitePathMarkup('atlas'));
  assert.equal(root.row[4].getAttribute('href'), '/elections/');
  assert.equal(root.row[4].getAttribute('aria-current'), 'page', 'at /elections/ (an empty data-tail)');
  assert.equal(root.trail, null);
  const national = render(sitePathMarkup('atlas', [{ label: 'India' }]));
  assert.equal(national.row[4].getAttribute('aria-current'), 'true', 'below the root, on /elections/india/');
  assert.deepEqual(national.crumbs.map((li) => li.textContent), ['Election Atlas', 'India']);
  assert.equal(national.crumbs[0].querySelector('a')!.getAttribute('href'), '/elections/');
  assert.equal(national.crumbs[1].firstElementChild!.getAttribute('aria-current'), 'page');
});

test('the atlas trail is led by the app: "Election Atlas › India › Uttar Pradesh"', () => {
  const { row, crumbs } = render(sitePathMarkup('atlas', STATE_TAIL));
  assert.equal(row[4].getAttribute('aria-current'), 'true');
  assert.deepEqual(crumbs.map((li) => li.textContent), ['Election Atlas', 'India', 'Uttar Pradesh']);
  assert.deepEqual(crumbs.map((li) => li.querySelector('a')?.getAttribute('href') ?? null), ['/elections/', '/elections/india/', null]);
  const seat = render(sitePathMarkup('atlas', [STATE_TAIL[0], { label: 'Uttar Pradesh', href: '/elections/india/state/?s=IN-UP' }, { label: 'Gorakhpur' }]));
  assert.deepEqual(seat.crumbs.map((li) => li.textContent), ['Election Atlas', 'India', 'Uttar Pradesh', 'Gorakhpur']);
  assert.deepEqual(seat.crumbs.map((li) => li.querySelector('a')?.getAttribute('href') ?? null), ['/elections/', '/elections/india/', '/elections/india/state/?s=IN-UP', null]);
});

test('trailOf: led by the app unless the first crumb links to its root; nothing at the root or for a lone crumb', () => {
  assert.deepEqual(trailOf(app('quiz'), []), []);
  assert.deepEqual(trailOf(app('quiz'), [{ label: 'History' }]), [{ label: 'Quiz Room', href: '/quiz' }, { label: 'History' }]);
  assert.deepEqual(trailOf(app('atlas'), STATE_TAIL), [{ label: 'Election Atlas', href: '/elections/' }, ...STATE_TAIL]);
  const rooted: Crumb[] = [{ label: 'Quiz Room', href: '/quiz' }, { label: 'History' }];
  assert.deepEqual(trailOf(app('quiz'), rooted), rooted, 'a first crumb at the app root is not repeated');
  assert.deepEqual(trailOf(app('quiz'), rooted.slice(0, 1)), [], 'a lone crumb says nothing the row does not');
  // A crumb with no link between the first and the last stays plain text.
  const { crumbs } = render(sitePathMarkup('chat', [{ label: 'Archive' }, { label: 'Front page' }]));
  assert.deepEqual(crumbs.map((li) => li.firstElementChild!.tagName), ['A', 'SPAN', 'SPAN']);
  assert.equal(crumbs[1].firstElementChild!.getAttribute('aria-current'), null);
});

test('the "›" between crumbs is drawn by CSS, so the trail reads as a plain list', () => {
  const { trail, css } = render(sitePathMarkup('quiz', [{ label: 'History' }]));
  assert.ok(!trail!.textContent!.includes('›'));
  const sep = css.find((r): r is CSSStyleRule => 'selectorText' in r && (r as CSSStyleRule).selectorText === '.sp-trail li+li::before');
  assert.ok(sep);
  assert.equal(sep.style.getPropertyValue('content'), '"\\203A"');
});

test('listed:false: the app says "Not listed" on its own row and is absent from every other one', () => {
  const apps = unlisted('graph');
  assert.equal(isUnlisted('graph', apps), true);
  assert.equal(isUnlisted('graph'), false);
  assert.equal(isUnlisted('nope', apps), false);

  const own = render(sitePathMarkup('graph', [], apps));
  assert.equal(own.row.length, 5);
  assert.equal(accessibleName(own.row[3]), `Graph Notes ${GATED}, Not listed`);
  assert.equal(own.row[3].getAttribute('aria-current'), 'page');

  for (const id of ['home', 'chat', 'quiz', 'atlas']) {
    const other = render(sitePathMarkup(id, [], apps));
    assert.equal(other.row.length, 4, id);
    assert.equal(other.doc.querySelector('[href="/graph/"]'), null, id);
    assert.ok(!other.doc.body.textContent!.includes('Graph Notes'), id);
    assert.ok(!other.doc.body.textContent!.includes('Not listed'), id);
  }
  const list = new JSDOM(siteAppsMarkup(apps)).window.document;
  assert.deepEqual([...list.querySelectorAll('li')].map((li) => li.getAttribute('data-app')), ['chat', 'quiz', 'atlas']);
  assert.deepEqual(JSON.parse(listedAppsJson(apps)).map((a: App) => a.id), ['home', 'chat', 'quiz', 'atlas'], '/_site/apps.json leaves it out too');
});

test('/_site/apps.json: every listed app in list order, with exactly what the Apps cards render', () => {
  assert.deepEqual(
    JSON.parse(listedAppsJson()),
    APPS.map(({ id, label, path, blurb, gated }) => ({ id, label, path, blurb, gated })),
  );
  assert.deepEqual(JSON.parse(listedAppsJson()).map((a: App) => a.id), ['home', 'chat', 'quiz', 'graph', 'atlas']);
});

test('the slot styles: Newsreader in sentence case, 44 px row targets, one line that scrolls rather than wraps', () => {
  const { css } = render(sitePathMarkup('atlas', STATE_TAIL));
  const styleRules = (rules: CSSRule[]) => rules.filter((r): r is CSSStyleRule => 'selectorText' in r);
  const rule = (selector: string) => {
    const found = styleRules(css).find((r) => r.selectorText === selector);
    assert.ok(found, selector);
    return found.style;
  };
  const declarations = styleRules(css).flatMap((r) => Array.from({ length: r.style.length }, (_, i) => r.style.getPropertyValue(r.style[i])));

  const sp = rule('.sp');
  assert.equal(sp.getPropertyValue('font'), '400 15px/1.3 var(--font-serif,Georgia,serif)');
  assert.equal(sp.getPropertyValue('text-transform'), 'none');
  assert.equal(rule('.sp-trail').getPropertyValue('font'), '400 14px/1.3 var(--font-serif,Georgia,serif)');
  assert.ok(!declarations.some((v) => /font-mono|uppercase/.test(v)), 'no mono or uppercase anywhere');

  const target = rule('.sp a');
  assert.equal(target.getPropertyValue('min-height'), '44px');
  assert.equal(target.getPropertyValue('min-width'), '44px');
  assert.equal(target.getPropertyValue('white-space'), 'nowrap');
  assert.equal(rule('.sp-trail a').getPropertyValue('min-height'), '32px');

  const row = rule('.sp-apps');
  assert.equal(row.getPropertyValue('flex-wrap'), 'nowrap');
  assert.equal(row.getPropertyValue('overflow-x'), 'auto');
  assert.equal(row.getPropertyValue('scrollbar-width'), 'none');
  assert.equal(rule('.sp-apps[data-more~="end"]').getPropertyValue('--sp-fade-e'), '2rem');
  assert.equal(rule('.sp-apps[data-more~="start"]').getPropertyValue('--sp-fade-s'), '2rem');
  assert.match(rule('.sp-apps[data-more]').getPropertyValue('mask-image'), /^linear-gradient\(to right,transparent/);
  assert.equal(rule('.sp a:focus-visible').getPropertyValue('outline-offset'), '-2px', 'the ring is drawn inside the scrolling row');
  assert.equal(css.filter((r) => 'media' in r).length, 0, 'no breakpoints: the row is the same everywhere, it just scrolls when it must');

  assert.equal(rule('.sp .sp-app[aria-current]').getPropertyValue('color'), 'var(--text)');
  assert.equal(rule('.sp .sp-app[aria-current] .sp-label').getPropertyValue('text-decoration'), 'underline 2px');
  assert.ok(!declarations.some((v) => v.includes('var(--accent)')), 'the current app is marked in ink, never accent');
});

test('the homepage list: the listed apps other than Home, gated ones marked for screen readers only', () => {
  const doc = new JSDOM(siteAppsMarkup()).window.document;
  const items = [...doc.querySelectorAll('ul.site-apps > li')];
  assert.deepEqual(items.map((li) => li.getAttribute('data-app')), ['chat', 'quiz', 'graph', 'atlas']);
  assert.deepEqual(items.map((li) => li.hasAttribute('data-gated')), [false, true, true, false]);
  assert.deepEqual(items.map((li) => li.querySelector('a')!.getAttribute('href')), ['/chat-archives', '/quiz', '/graph/', '/elections/']);
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
  const { doc, trail } = render(sitePathMarkup('chat', [{ label: evil, href: '/chat-archives/?q="x"' }, { label: evil }]));
  assert.equal(doc.querySelector('img'), null);
  assert.equal(trail!.querySelectorAll('a')[1].getAttribute('href'), '/chat-archives/?q="x"');
  assert.equal(trail!.querySelector('[aria-current]')!.textContent, evil);
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

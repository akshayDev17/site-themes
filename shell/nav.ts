// The markup compose() puts into an app's <site-slot> elements, built from the
// app list (src/apps.ts). Pure string functions, so they run in Node tests as
// well as in the Worker.
//
//   <site-slot name="site-path" data-tail='[{"label":"India","href":"/elections/india/"}]'>
//     the site path: akshayprabhakant.com / <the apps> / <the app's own crumbs>.
//     The apps sit inline wherever there is room. On a narrow (portrait phone)
//     screen they fold into the current app's name, a button that opens a
//     bottom sheet (a modal <dialog> opened by an invoker command, so it needs
//     no JavaScript where the browser supports commands; site.js covers the
//     rest).
//   <site-slot name="site-apps">
//     the listed apps other than the homepage, for the homepage Apps cards.
//
// Each slot carries its own small <style>, so a page with no slot gets nothing.
import { APPS, HOME_ID, type App } from '../src/apps.js';

/** One of the app's own crumbs after the app name; the last is the current page. */
export interface Crumb {
  label: string;
  href?: string;
}

/** The dialog the phone pill opens; one site path per page. */
export const SHEET_ID = 'site-path-sheet';
const SITE = 'akshayprabhakant.com';
const GATED_TEXT = ' (invite-only, sign-in required)';
// A same-origin path: one leading '/', never '//' or '/\' (both leave the origin), no whitespace.
const LOCAL_PATH = /^\/(?![/\\])[^\s\\]*$/;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Whether compose() should mark this app's pages noindex. Unknown ids are not. */
export function isUnlisted(appId: string, apps: readonly App[] = APPS): boolean {
  return apps.find((a) => a.id === appId)?.listed === false;
}

/** The data-tail attribute: a JSON array of { label, href? }. Throws on anything else. */
export function parseTail(raw: string | null): Crumb[] {
  if (raw === null || raw.trim() === '') return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('data-tail must be a JSON array');
  return value.map((item: unknown, i) => {
    const { label, href } = (item ?? {}) as Record<string, unknown>;
    if (typeof label !== 'string' || !label.trim()) throw new Error(`data-tail[${i}]: label must be a non-empty string`);
    if (href === undefined) return { label };
    if (typeof href !== 'string' || !LOCAL_PATH.test(href)) throw new Error(`data-tail[${i}]: href must be a path on this site`);
    return { label, href };
  });
}

const LOCK =
  '<svg class="site-lock" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">' +
  '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const VH = (text: string) => `<span class="site-vh">${escapeHtml(text)}</span>`;
const lock = (app: App) => (app.gated ? LOCK + VH(GATED_TEXT) : '');
const notListed = (app: App) => (app.listed ? '' : `<span class="sp-tag">${VH(', ')}Not listed</span>`);

const VH_CSS = '.site-vh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}';
const LOCK_CSS = '.site-lock{fill:none;stroke:currentColor;stroke-width:2;margin-left:.25em;flex:none}';

// Newsreader, sentence case, 15 px; every target at least 44 px (the path's
// left padding is pulled back so its text lines up with the masthead); the current
// app in ink (not accent), underlined; the tail's current page plain ink text.
// At 900 px and below the site name is "AP"; at 640 px and below the apps fold into
// the pill and only the last crumb of the tail shows.
const PATH_CSS = [
  'site-slot[name="site-path"]{display:block}',
  '.sp{display:flex;flex-wrap:wrap;align-items:center;margin:0 0 0 -.4rem;padding:0;font:400 15px/1.3 var(--font-serif,Georgia,serif);letter-spacing:normal;text-transform:none;color:var(--text-muted)}',
  '.sp ul{display:flex;flex-wrap:wrap;align-items:center;margin:0;padding:0;list-style:none}',
  '.sp a,.sp-here{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;min-width:44px;padding:0 .4rem;color:inherit;text-decoration:none}',
  '.sp a:hover{color:var(--text);text-decoration:underline;text-underline-offset:.25em}',
  '.sp .sp-app[aria-current]{color:var(--text)}',
  '.sp .sp-app[aria-current] .sp-label{text-decoration:underline 2px;text-underline-offset:.35em}',
  '.sp .sp-page{color:var(--text)}',
  '.sp-sep{padding:0 .1rem;color:var(--text-muted)}',
  '.sp-tag{margin-left:.4em;font-size:13px;color:var(--text-muted);text-decoration:none}',
  // The pill is drawn 34 px tall; its ::before makes the tap area 44 px.
  '.sp-pill{display:none;position:relative;align-items:center;gap:.3em;box-sizing:border-box;min-height:34px;margin:0 .2rem;padding:0 .8rem;border:1px solid var(--card-line);border-radius:999px;background:var(--card);color:var(--text);font:inherit;cursor:pointer}',
  '.sp-pill::before{content:"";position:absolute;inset:-6px -1px}',
  '.sp-chev{font-size:.8em}',
  '.sp a:focus-visible,.sp-pill:focus-visible,.sp-sheet a:focus-visible,.sp-close:focus-visible{outline:2px solid var(--focus);outline-offset:2px}',
  '.sp-short{display:none!important}',
  '@media (max-width:900px){.sp-long{display:none!important}.sp-short{display:inline-flex!important;justify-content:flex-start}}',
  '@media (max-width:640px){.sp-apps{display:none!important}.sp-pill{display:inline-flex}.sp-crumb:not(:last-child){display:none}}',
  '.sp-sheet{position:fixed;inset:auto 0 0 0;box-sizing:border-box;width:100%;max-width:none;max-height:85dvh;margin:0;padding:.5rem 1rem calc(1rem + env(safe-area-inset-bottom,0px));overflow:auto;border:1px solid var(--card-line);border-bottom:0;border-radius:16px 16px 0 0;background:var(--card);color:var(--text);box-shadow:var(--shadow-hover);font:400 15px/1.3 var(--font-serif,Georgia,serif)}',
  '.sp-sheet::backdrop{background:rgb(0 0 0/.4)}',
  '.sp-sheet-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding-bottom:.25rem}',
  '.sp-sheet-head a{display:inline-flex;align-items:center;min-height:44px;color:var(--text-muted);text-decoration:none}',
  '.sp-close{min-height:44px;min-width:44px;padding:0 1rem;border:1px solid var(--card-line);border-radius:999px;background:var(--card);color:var(--text);font:inherit;cursor:pointer}',
  '.sp-sheet ul{margin:0;padding:0;list-style:none}',
  '.sp-sheet li a{display:grid;grid-template-columns:1fr auto;align-items:center;align-content:center;column-gap:1rem;row-gap:.1rem;min-height:58px;padding:.5rem .75rem;border-radius:var(--radius-card,.7rem);color:var(--text);text-decoration:none}',
  '.sp-sheet li a[aria-current]{background:var(--surface-2)}',
  '.sp-name{display:inline-flex;align-items:center}',
  '.sp-blurb{grid-column:1;font-size:13px;color:var(--text-muted)}',
  '.sp-here-tag{grid-column:2;grid-row:1/span 2;font-size:13px;color:var(--text-muted)}',
  VH_CSS,
  LOCK_CSS,
].join('');

/** One app in the inline row: the current app is marked, a link when the page is deeper in the app. */
function rowItem(app: App, current: boolean, atAppRoot: boolean): string {
  const text = escapeHtml(app.label) + lock(app);
  if (!current) return `<li><a href="${escapeHtml(app.path)}">${text}</a></li>`;
  const label = `<span class="sp-label">${escapeHtml(app.label)}</span>${lock(app)}`;
  if (atAppRoot) return `<li><span class="sp-here sp-app" aria-current="page">${label}${notListed(app)}</span></li>`;
  return `<li><a class="sp-app" href="${escapeHtml(app.path)}" aria-current="true">${label}${notListed(app)}</a></li>`;
}

/** One row in the phone sheet. */
function sheetItem(app: App, current: boolean, atAppRoot: boolean): string {
  const here = current ? ` aria-current="${atAppRoot ? 'page' : 'true'}"` : '';
  const tag = current ? `<span class="sp-here-tag">${app.listed ? 'You are here' : 'You are here · Not listed'}</span>` : '';
  return (
    `<li><a href="${escapeHtml(app.path)}"${here}><span class="sp-name">${escapeHtml(app.label)}${lock(app)}</span>` +
    `<span class="sp-blurb">${escapeHtml(app.blurb)}</span>${tag}</a></li>`
  );
}

/** The app's own crumbs: links, except the last, which is the current page as plain text. */
function tailMarkup(tail: readonly Crumb[]): string {
  return tail
    .map((c, i) => {
      const sep = '<span class="sp-sep" aria-hidden="true">/</span>';
      const label = escapeHtml(c.label);
      const last = i === tail.length - 1;
      const crumb = last
        ? `<span class="sp-here sp-page" aria-current="page">${label}</span>`
        : c.href
          ? `<a href="${escapeHtml(c.href)}">${label}</a>`
          : `<span class="sp-here">${label}</span>`;
      return `<span class="sp-crumb">${sep}${crumb}</span>`;
    })
    .join('');
}

/**
 * The site path for `appId`'s page, or null when the app is not in the list
 * (compose() then leaves the slot as the app wrote it). Shown: every listed app,
 * plus the current app even when it is unlisted ("Not listed").
 */
export function sitePathMarkup(appId: string, tail: readonly Crumb[] = [], apps: readonly App[] = APPS): string | null {
  const current = apps.find((a) => a.id === appId);
  if (!current) return null;
  const shown = apps.filter((a) => a.listed || a === current);
  const atAppRoot = tail.length === 0;
  const row = shown.map((a) => rowItem(a, a === current, atAppRoot)).join('');
  const sheet = shown.map((a) => sheetItem(a, a === current, atAppRoot)).join('');
  return (
    `<style data-site-shell>${PATH_CSS}</style>` +
    '<nav class="sp" aria-label="Site path">' +
    `<a class="sp-long" href="/">${SITE}${VH(' home')}</a>` +
    `<a class="sp-short" href="/" aria-label="AP, ${SITE} home">AP</a>` +
    '<span class="sp-sep" aria-hidden="true">/</span>' +
    `<ul class="sp-apps">${row}</ul>` +
    `<button type="button" class="sp-pill" commandfor="${SHEET_ID}" command="show-modal" aria-haspopup="dialog">` +
    `${escapeHtml(current.label)}<span class="sp-chev" aria-hidden="true">⌄</span>${VH(', switch app')}</button>` +
    tailMarkup(tail) +
    '</nav>' +
    `<dialog id="${SHEET_ID}" class="sp-sheet" aria-label="Apps on ${SITE}" closedby="any">` +
    `<div class="sp-sheet-head"><a href="/">${SITE}${VH(' home')}</a>` +
    `<button type="button" class="sp-close" commandfor="${SHEET_ID}" command="close">Close</button></div>` +
    `<ul>${sheet}</ul></dialog>`
  );
}

const APPS_CSS = [
  '.site-apps{margin:0;padding:0;list-style:none}',
  '.site-apps a{display:flex;flex-direction:column;min-height:44px;color:inherit;text-decoration:none}',
  '.site-apps-name{display:inline-flex;align-items:center;color:var(--text)}',
  '.site-apps-blurb{color:var(--text-muted)}',
  VH_CSS,
  LOCK_CSS,
].join('');

/** The listed apps other than the homepage, for the homepage Apps cards. */
export function siteAppsMarkup(apps: readonly App[] = APPS): string {
  const items = apps
    .filter((a) => a.listed && a.id !== HOME_ID)
    .map(
      (a) =>
        `<li data-app="${escapeHtml(a.id)}"${a.gated ? ' data-gated=""' : ''}><a href="${escapeHtml(a.path)}">` +
        `<span class="site-apps-name">${escapeHtml(a.label)}${lock(a)}</span>` +
        `<span class="site-apps-blurb">${escapeHtml(a.blurb)}</span></a></li>`,
    )
    .join('');
  return `<style data-site-shell>${APPS_CSS}</style><ul class="site-apps">${items}</ul>`;
}

/**
 * What compose() puts inside <site-slot name="…"> on `appId`'s page, or null to
 * leave the slot as the app wrote it (an unknown slot name or app). Throws on a
 * malformed data-tail; compose() then also leaves the slot alone.
 */
export function slotMarkup(name: string, attr: (name: string) => string | null, appId: string, apps: readonly App[] = APPS): string | null {
  if (name === 'site-path') return sitePathMarkup(appId, parseTail(attr('data-tail')), apps);
  if (name === 'site-apps') return siteAppsMarkup(apps);
  return null;
}

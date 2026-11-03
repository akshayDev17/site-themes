// The markup compose() puts into an app's <site-slot> elements, built from the
// app list (src/apps.ts). Pure string functions, so they run in Node tests as
// well as in the Worker.
//
//   <site-slot name="site-path" data-tail='[{"label":"India","href":"/elections/india/"}]'>
//     the site row, "Home  AI Digest  Quiz Room  Graph Notes  Election Atlas", with
//     the current app marked, and under it, on its own line, the page's trail
//     (a breadcrumb such as "India › Uttar Pradesh") drawn from data-tail. The
//     row sits inline wherever it fits; where it does not (a portrait phone) it
//     scrolls sideways as one line, and site.js scrolls the current app into view
//     and fades the edge that has more apps past it.
//   <site-slot name="site-apps">
//     the listed apps other than the homepage, for the homepage Apps cards.
//
// It also builds /_site/apps.json (listedAppsJson), the same list for a page
// that compose() does not reach: GitHub Pages serves /?… and /index.html bare.
//
// Each slot carries its own small <style>, so a page with no slot gets nothing.
import { APPS, HOME_ID, type App } from '../src/apps.js';

/** One of the app's own crumbs after the app name; the last is the current page. */
export interface Crumb {
  label: string;
  href?: string;
}

/** What a screen reader hears after a gated app's name. Nothing is drawn for it. */
export const GATED_TEXT = ' (sign-in required)';
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

const VH = (text: string) => `<span class="site-vh">${escapeHtml(text)}</span>`;
const gatedNote = (app: App) => (app.gated ? VH(GATED_TEXT) : '');
const notListed = (app: App) => (app.listed ? '' : `<span class="sp-tag">${VH(', ')}Not listed</span>`);

const VH_CSS = '.site-vh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}';

// The row: Newsreader, sentence case, 15 px, muted; the current app in ink (not
// accent) with a 2 px underline; every target at least 44 px, and the row's left
// edge pulled back by a link's padding so its text lines up with the page. It is
// one line that never wraps: where it is wider than its box it scrolls sideways
// (no scrollbar drawn), and site.js sets data-more="start end" on the side(s)
// with apps past the edge, which fade out. Its focus ring is drawn inside the
// link, since a scrolling box clips anything drawn outside it.
// The trail: its own line under the row, 14 px, "›" between crumbs (drawn by
// CSS, so screen readers hear a plain list), links underlined in a hairline, the
// current page plain ink text, 32 px targets.
const FADE = 'linear-gradient(to right,transparent,#000 var(--sp-fade-s,0px),#000 calc(100% - var(--sp-fade-e,0px)),transparent)';
const PATH_CSS = [
  'site-slot[name="site-path"]{display:block;min-width:0}',
  '.sp{box-sizing:border-box;min-width:0;max-width:calc(100% + .5rem);margin:0 0 0 -.5rem;padding:0;font:400 15px/1.3 var(--font-serif,Georgia,serif);letter-spacing:normal;text-transform:none;color:var(--text-muted)}',
  // 100vw - 1rem caps the row on a page whose boxes are sized by their content, which would otherwise grow to fit it.
  '.sp-apps{display:flex;flex-wrap:nowrap;align-items:center;gap:0 .25rem;box-sizing:border-box;max-width:min(100%,100vw - 1rem);margin:0;padding:0;list-style:none;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scrollbar-width:none}',
  '.sp-apps::-webkit-scrollbar{display:none}',
  '.sp-apps li{flex:none}',
  `.sp-apps[data-more]{-webkit-mask-image:${FADE};mask-image:${FADE}}`,
  '.sp-apps[data-more~="start"]{--sp-fade-s:2rem}',
  '.sp-apps[data-more~="end"]{--sp-fade-e:2rem}',
  '.sp a{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;min-width:44px;padding:0 .5rem;color:inherit;text-decoration:none;white-space:nowrap}',
  '.sp a:hover{color:var(--text);text-decoration:underline 1px;text-underline-offset:.35em}',
  '.sp .sp-app[aria-current]{color:var(--text);text-decoration:none}',
  '.sp .sp-app[aria-current] .sp-label{text-decoration:underline 2px;text-underline-offset:.35em}',
  '.sp-tag{margin-left:.4em;font-size:13px;color:var(--text-muted)}',
  '.sp a:focus-visible{outline:2px solid var(--focus);outline-offset:-2px}',
  '.sp-trail{margin:.25rem 0 0;padding:0;font:400 14px/1.3 var(--font-serif,Georgia,serif);letter-spacing:normal;text-transform:none;color:var(--text-muted)}',
  '.sp-trail ol{display:flex;flex-wrap:wrap;align-items:center;margin:0;padding:0;list-style:none}',
  '.sp-trail li{display:inline-flex;align-items:center;min-width:0}',
  '.sp-trail li+li::before{content:"\\203A";padding:0 .45rem;color:var(--text-muted)}',
  '.sp-trail a{display:inline-flex;align-items:center;min-height:32px;color:inherit;text-decoration:underline 1px;text-decoration-color:var(--line-strong);text-underline-offset:.3em}',
  '.sp-trail a:hover{color:var(--text);text-decoration-color:currentColor}',
  '.sp-trail a:focus-visible{outline:2px solid var(--focus);outline-offset:2px}',
  '.sp-trail [aria-current]{color:var(--text)}',
  VH_CSS,
].join('');

/** One app in the row: always a link to the app's root; the current app is marked. */
function rowItem(app: App, current: boolean, atAppRoot: boolean): string {
  const href = escapeHtml(app.path);
  if (!current) return `<li><a href="${href}">${escapeHtml(app.label)}${gatedNote(app)}</a></li>`;
  return (
    `<li><a class="sp-app" href="${href}" aria-current="${atAppRoot ? 'page' : 'true'}">` +
    `<span class="sp-label">${escapeHtml(app.label)}</span>${gatedNote(app)}${notListed(app)}</a></li>`
  );
}

/**
 * The page's trail: the app's crumbs, led by the app itself (a link to its root)
 * unless the first crumb already links there, as the atlas's "India" does. Empty
 * at the app's root, and when that leaves a single crumb, which says nothing the
 * row does not.
 */
export function trailOf(app: App, tail: readonly Crumb[]): Crumb[] {
  if (tail.length === 0) return [];
  const trail = tail[0].href === app.path ? [...tail] : [{ label: app.label, href: app.path }, ...tail];
  return trail.length < 2 ? [] : trail;
}

/** The trail as a breadcrumb: links, except the last, which is the current page as plain text. */
function trailMarkup(trail: readonly Crumb[]): string {
  if (trail.length === 0) return '';
  const items = trail
    .map((c, i) => {
      const label = escapeHtml(c.label);
      if (i === trail.length - 1) return `<li><span aria-current="page">${label}</span></li>`;
      return c.href ? `<li><a href="${escapeHtml(c.href)}">${label}</a></li>` : `<li><span>${label}</span></li>`;
    })
    .join('');
  return `<nav class="sp-trail" aria-label="Breadcrumb"><ol>${items}</ol></nav>`;
}

/**
 * The site row and trail for `appId`'s page, or null when the app is not in the
 * list (compose() then leaves the slot as the app wrote it). Shown: every listed
 * app, plus the current app even when it is unlisted ("Not listed").
 */
export function sitePathMarkup(appId: string, tail: readonly Crumb[] = [], apps: readonly App[] = APPS): string | null {
  const current = apps.find((a) => a.id === appId);
  if (!current) return null;
  const shown = apps.filter((a) => a.listed || a === current);
  const row = shown.map((a) => rowItem(a, a === current, tail.length === 0)).join('');
  return (
    `<style data-site-shell>${PATH_CSS}</style>` +
    `<nav class="sp" aria-label="Site"><ul class="sp-apps">${row}</ul></nav>` +
    trailMarkup(trailOf(current, tail))
  );
}

const APPS_CSS = [
  '.site-apps{margin:0;padding:0;list-style:none}',
  '.site-apps a{display:flex;flex-direction:column;min-height:44px;color:inherit;text-decoration:none}',
  '.site-apps-name{display:inline-flex;align-items:center;color:var(--text)}',
  '.site-apps-blurb{color:var(--text-muted)}',
  VH_CSS,
].join('');

/** The listed apps other than the homepage, for the homepage Apps cards. */
export function siteAppsMarkup(apps: readonly App[] = APPS): string {
  const items = apps
    .filter((a) => a.listed && a.id !== HOME_ID)
    .map(
      (a) =>
        `<li data-app="${escapeHtml(a.id)}"${a.gated ? ' data-gated=""' : ''}><a href="${escapeHtml(a.path)}">` +
        `<span class="site-apps-name">${escapeHtml(a.label)}${gatedNote(a)}</span>` +
        `<span class="site-apps-blurb">${escapeHtml(a.blurb)}</span></a></li>`,
    )
    .join('');
  return `<style data-site-shell>${APPS_CSS}</style><ul class="site-apps">${items}</ul>`;
}

/** One app in /_site/apps.json: what the homepage Apps cards render. */
export type ListedApp = Pick<App, 'id' | 'label' | 'path' | 'blurb' | 'gated'>;

/**
 * The body of /_site/apps.json: every listed app (the homepage first, as
 * "home"), in list order. Unlisted apps are left out.
 */
export function listedAppsJson(apps: readonly App[] = APPS): string {
  const listed: ListedApp[] = apps.filter((a) => a.listed).map(({ id, label, path, blurb, gated }) => ({ id, label, path, blurb, gated }));
  return JSON.stringify(listed);
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

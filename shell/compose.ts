// compose(): adds the shared site parts to an app's HTML as it streams out.
//
// - <head>: the inline boot script and the inline theme tokens go first (after
//   a leading <meta charset>, which must stay inside the first 1024 bytes),
//   followed by the deferred /_site/<build>/site.js that defines
//   <site-theme-picker>. An unlisted app's pages also get a noindex robots meta.
// - <site-slot name="site-path"> and <site-slot name="site-apps">: filled from
//   the app list (src/apps.ts; markup in nav.ts). The <site-slot> element stays
//   and only its content is replaced, so whatever the app put inside it is the
//   fallback shown when compose() does not run. A page with no slot gets no
//   navigation at all.
import { APP_ID, APPS, type App } from '../src/apps.js';
import { isUnlisted, slotMarkup } from './nav.js';

export interface Build {
  /** Content hash of this release's assets; also the /_site/<id>/ directory. */
  id: string;
  /** Inline markup: the boot <script> and the tokens <style>. */
  inline: string;
  /** Files under /_site/<id>/ that every composed page loads (deferred scripts). */
  scripts: string[];
}

export interface ComposeOptions {
  /** Which app is calling; recorded in a response header for debugging. */
  app: string;
  /**
   * Where /_site/ assets are reachable from this app's pages: '<app prefix>/_site/'
   * while the app forwards them. site-shell's ASSET_BASE ('/_site/', the zone
   * route) takes precedence when set.
   */
  assetBase?: string;
}

const ASSET_BASE = /^\/(?:[a-z0-9_-]+\/)*_site\/$/;
const NOINDEX = '<meta name="robots" content="noindex" data-site-shell>';
const CHAR_REF = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(quot|amp|apos|lt|gt));/g;
const NAMED_REFS: Record<string, string> = { quot: '"', amp: '&', apos: "'", lt: '<', gt: '>' };

/** HTMLRewriter returns attribute values as written; this resolves their character references. */
function decodeAttr(raw: string | null): string | null {
  return (
    raw?.replace(CHAR_REF, (ref, dec?: string, hex?: string, name?: string) => {
      if (name) return NAMED_REFS[name];
      const cp = dec ? Number(dec) : parseInt(hex!, 16);
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : ref;
    }) ?? null
  );
}

export function isHtml(res: Response): boolean {
  return res.status === 200 && (res.headers.get('content-type') ?? '').toLowerCase().startsWith('text/html');
}

/** The markup inserted into <head>. Throws on an assetBase that could break out of the attribute. */
export function headMarkup(build: Build, assetBase = '/_site/'): string {
  if (!ASSET_BASE.test(assetBase)) throw new Error(`bad assetBase: ${assetBase}`);
  const tags = build.scripts.map((file) => `<script defer src="${assetBase}${build.id}/${file}"></script>`);
  return build.inline + tags.join('');
}

/**
 * Returns the composed response, or `res` itself for anything that is not a
 * 200 HTML page. Validators are dropped: the body now depends on this build as
 * well as on the app's file, so the app's ETag no longer describes it. `apps`
 * is the app list; only tests pass another one.
 */
export function composeResponse(res: Response, opts: ComposeOptions, build: Build, apps: readonly App[] = APPS): Response {
  if (!isHtml(res)) return res;
  if (!APP_ID.test(opts.app)) throw new Error(`bad app: ${opts.app}`);
  const unlisted = isUnlisted(opts.app, apps);
  const markup = headMarkup(build, opts.assetBase) + (unlisted ? NOINDEX : '');

  const headers = new Headers(res.headers);
  headers.delete('etag');
  headers.delete('last-modified');
  headers.delete('content-length');
  headers.set('x-site-shell', `${build.id}; app=${opts.app}`);

  let inserted = false;
  const insertNear = (el: Element) => {
    if (inserted) return;
    inserted = true;
    // A leading <meta charset> stays first so it remains in the first 1024 bytes.
    if (el.tagName === 'meta' && el.hasAttribute('charset')) el.after(markup, { html: true });
    else el.before(markup, { html: true });
  };

  // Each slot name is filled once per page.
  const filled = new Set<string>();
  const fillSlot = (el: Element) => {
    const attr = (attrName: string) => decodeAttr(el.getAttribute(attrName));
    const name = attr('name') ?? '';
    if (filled.has(name)) return;
    const html = slotMarkup(name, attr, opts.app, apps);
    if (html === null) return;
    filled.add(name);
    el.setInnerContent(html, { html: true });
  };

  return new HTMLRewriter()
    .on('head > *', { element: guard(insertNear) })
    .on('site-slot[name]', { element: guard(fillSlot) })
    .on('head', {
      element: guard((el: Element) => {
        el.onEndTag((end) => {
          if (inserted) return;
          inserted = true;
          end.before(markup, { html: true });
        });
      }),
    })
    .transform(new Response(res.body, { status: res.status, statusText: res.statusText, headers }));
}

/**
 * A handler that throws mid-stream cannot fall back to the app's page any more
 * (the response has already started), so a handler error skips that one edit
 * instead of failing the page.
 */
function guard<T>(fn: (arg: T) => void): (arg: T) => void {
  return (arg: T) => {
    try {
      fn(arg);
    } catch (err) {
      console.error('site-shell: handler skipped', err);
    }
  };
}

// compose(): adds the shared site parts to an app's HTML as it streams out.
//
// Theme only for now: the inline boot script and the inline theme tokens go
// first in <head> (after a leading <meta charset>, which must stay inside the
// first 1024 bytes), followed by the deferred /_site/<build>/site.js that
// defines <site-theme-picker>. <site-slot name="…"> elements are the slot
// point for later shared parts (navigation); the registry is empty today, so
// they pass through untouched.

export interface Build {
  /** Content hash of this release's assets; also the /_site/<id>/ directory. */
  id: string;
  /** Inline markup: the boot <script> and the tokens <style>. */
  inline: string;
  /** Files under /_site/<id>/ that every composed page loads (deferred scripts). */
  scripts: string[];
}

/** Slot name -> HTML that replaces <site-slot name="…">. Empty until a nav is chosen. */
export type Slots = Record<string, string>;

export interface ComposeOptions {
  /** Which app is calling; recorded in a response header for debugging. */
  app: string;
  /**
   * Where /_site/ assets are reachable from this app's pages. '/_site/' once the
   * zone route is attached; '<app prefix>/_site/' while the app forwards them.
   */
  assetBase?: string;
}

const ASSET_BASE = /^\/(?:[a-z0-9_-]+\/)*_site\/$/;
const APP = /^[a-z0-9-]{1,32}$/;

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
 * well as on the app's file, so the app's ETag no longer describes it.
 */
export function composeResponse(res: Response, opts: ComposeOptions, build: Build, slots: Slots = {}): Response {
  if (!isHtml(res)) return res;
  if (!APP.test(opts.app)) throw new Error(`bad app: ${opts.app}`);
  const markup = headMarkup(build, opts.assetBase);

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

  let rewriter = new HTMLRewriter()
    .on('head > *', { element: guard(insertNear) })
    .on('head', {
      element: guard((el: Element) => {
        el.onEndTag((end) => {
          if (inserted) return;
          inserted = true;
          end.before(markup, { html: true });
        });
      }),
    });

  if (Object.keys(slots).length > 0) {
    rewriter = rewriter.on('site-slot[name]', {
      element: guard((el: Element) => {
        const html = slots[el.getAttribute('name') ?? ''];
        if (html !== undefined) el.replace(html, { html: true });
      }),
    });
  }

  return rewriter.transform(new Response(res.body, { status: res.status, statusText: res.statusText, headers }));
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

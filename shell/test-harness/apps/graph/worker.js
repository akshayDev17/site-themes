// Harness copy of graph-notes/frontend/worker.js with the proposed site-shell hook (README §Wiring an app).
/**
 * Serves the static export of the graph viewer at /graph/*.
 *
 * Copied from quiz-app's worker.js. The export is built with basePath /graph, so
 * its pages and chunks are linked as /graph/..., but the files in `out/` sit at the
 * root of the ASSETS binding. This Worker strips the /graph prefix and hands the
 * request to ASSETS.
 *
 * ASSETS knows nothing of the prefix, so its redirects point at prefix-less paths.
 * Left alone, the browser would follow that out of the app to GitHub Pages, so a
 * same-origin Location is re-prefixed on the way out.
 *
 * sw.js is served `no-cache` so a phone picks up a new app version the next time
 * it is online instead of after the HTTP cache expires.
 */
const PREFIX = /^\/graph(?=\/|$)/;

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    u.pathname = u.pathname.replace(PREFIX, '') || '/';
    // site-shell's files, through this route until akshayprabhakant.com/_site/* is routed.
    if (u.pathname.startsWith('/_site/') && env.SHELL) return env.SHELL.fetch(new Request(u, req));
    const page = () => env.ASSETS.fetch(new Request(u, req));
    const res = await withShell(reprefixRedirect(await page(), u), env, page, 'graph', '/graph/_site/');
    return markNoCache(res, u.pathname);
  },
};

// The shared site parts (site-themes/shell): compose() adds the theme to the
// page as it streams out. Fail open: unbound, failing or unreachable site-shell
// serves the page exactly as built. The body went to site-shell with the call,
// so the fallback fetches the page again (a static asset: free).
async function withShell(res, env, refetch, app, assetBase) {
  const type = res.headers.get('content-type') || '';
  if (!env.SHELL || res.status !== 200 || !type.startsWith('text/html')) return res;
  try {
    return await env.SHELL.compose(res, { app, assetBase });
  } catch (err) {
    console.error('site-shell: compose failed, serving the page as built:', String(err));
    return refetch();
  }
}

function reprefixRedirect(res, origin) {
  const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
  if (!location) return res;
  const target = new URL(location, origin);
  if (target.origin !== origin.origin || PREFIX.test(target.pathname)) return res;
  const headers = new Headers(res.headers);
  headers.set('location', `/graph${target.pathname}${target.search}${target.hash}`);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function markNoCache(res, pathname) {
  if (pathname !== '/sw.js') return res;
  const headers = new Headers(res.headers);
  headers.set('cache-control', 'no-cache');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

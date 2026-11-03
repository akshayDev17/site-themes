// Harness copy of quiz-app/frontend/worker.js with the proposed site-shell hook (README §Wiring an app).
/**
 * Serves the static export of the quiz app at /quiz/*.
 *
 * The export is built with basePath /quiz, so its pages and chunks are linked as
 * /quiz/..., but the files in `out/` sit at the root of the ASSETS binding. This
 * Worker strips the /quiz prefix and hands the request to ASSETS, which applies
 * Cloudflare's clean-URL handling (`/quiz/play` -> `play.html`).
 *
 * ASSETS knows nothing of the prefix, so its redirects point at prefix-less paths
 * (`/play/` -> `/play`). Left alone, the browser would follow that out of the app
 * to GitHub Pages, so a same-origin Location is re-prefixed on the way out.
 */
const PREFIX = /^\/quiz(?=\/|$)/;

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    u.pathname = u.pathname.replace(PREFIX, '') || '/';
    // site-shell's files, through this route until akshayprabhakant.com/_site/* is routed.
    if (u.pathname.startsWith('/_site/') && env.SHELL) return env.SHELL.fetch(new Request(u, req));
    const page = () => env.ASSETS.fetch(new Request(u, req));
    return withShell(reprefixRedirect(await page(), u), env, page, 'quiz', '/quiz/_site/');
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
  headers.set('location', `/quiz${target.pathname}${target.search}${target.hash}`);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

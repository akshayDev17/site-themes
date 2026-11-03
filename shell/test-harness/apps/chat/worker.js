// Harness copy of ai-chat-archive/frontend/worker.js with the proposed site-shell hook (README §Wiring an app).
/**
 * Serves the static export of the archive at /chat-archives/*.
 *
 * The Next.js app is exported to `out/` and uploaded as static assets; this
 * Worker's only job is to route the one dynamic path — a story permalink
 * `/chat-archives/<share-id>` — onto the single prerendered `[id]` page
 * (`chat-archives/_story.html`). The client reads the real id from the URL, so
 * one HTML file serves every story.
 *
 * Everything else falls through to the ASSETS binding, which applies Cloudflare's
 * clean-URL HTML handling (`/chat-archives` → `chat-archives.html`) and serves
 * the `_next/*` chunks and `vendors/*` marks.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // site-shell's files, through this route until akshayprabhakant.com/_site/* is routed.
    if (url.pathname.startsWith('/chat-archives/_site/') && env.SHELL) {
      return env.SHELL.fetch(new Request(new URL(url.pathname.slice('/chat-archives'.length), url), request));
    }
    // Share ids are UUIDs; `login`, `desk`, `_story`, and the front page are not.
    const target = /^\/chat-archives\/[0-9a-fA-F-]{36}\/?$/.test(url.pathname)
      ? new URL('/chat-archives/_story', url)
      : request;
    const page = () => env.ASSETS.fetch(target);
    return withShell(await page(), env, page, 'chat', '/chat-archives/_site/');
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

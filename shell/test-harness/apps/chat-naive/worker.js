// Harness only: the hook as first sketched, returning the original response
// after a failed compose(). Kept to prove why the real hook fetches the page
// again: the body has already gone to site-shell with the call.
export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
    try {
      return await env.SHELL.compose(res, { app: 'chat' });
    } catch {
      return res;
    }
  },
};

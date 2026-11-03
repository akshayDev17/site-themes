// Harness only: the homepage is served by GitHub Pages and has no Worker. This
// stands in for one on the proposed exact `/` route (not approved), so compose()
// runs on the homepage's saved HTML.
export default {
  async fetch(request, env) {
    const page = () => env.ASSETS.fetch(request);
    return withShell(await page(), env, page, 'home', '/_site/');
  },
};

// The hook from README §Wiring an app.
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

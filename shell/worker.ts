// The site-shell Worker.
//
// - RPC: an app's Worker calls env.SHELL.compose(response, { app, assetBase })
//   over a Service Binding and returns what comes back (see compose.ts).
// - Static assets: /_site/<build>/… are files in shell/public/, served by the
//   asset layer with a one-year immutable Cache-Control (public/_headers).
//   fetch() below runs only for paths that are not files: a missing /_site/
//   file, an app forwarding <prefix>/_site/… with its prefix already stripped,
//   and the homepage.
// - Routes (wrangler.jsonc): akshayprabhakant.com/_site/* and the exact
//   akshayprabhakant.com/. The homepage is composed from GitHub Pages and fails
//   open to the Pages response unchanged. It is served on HOME_ORIGIN's host
//   only: elsewhere (workers.dev, a preview URL) / is a 404 like any non-file.
import { WorkerEntrypoint } from 'cloudflare:workers';
import { composeResponse, type Build, type ComposeOptions } from './compose';
import build from './generated/build.json';

export interface Env {
  ASSETS: Fetcher;
  /**
   * '/_site/' while akshayprabhakant.com/_site/* routes here: every composed
   * page loads the shared files from that one URL, whatever assetBase the app
   * passes. Unset, each app's own forwarded prefix is used.
   */
  ASSET_BASE?: string;
  /**
   * Where the homepage is built and served: GitHub Pages behind
   * https://akshayprabhakant.com. On the zone's exact `/` route, a fetch to
   * the same zone goes to the DNS origin (Pages), never back to this Worker.
   * The homepage is served only to requests for this host.
   */
  HOME_ORIGIN: string;
}

export default class SiteShell extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/' && url.host === new URL(this.env.HOME_ORIGIN).host) return this.home(request, url);
    if (url.pathname.startsWith('/_site/')) {
      const res = await this.env.ASSETS.fetch(request);
      // _headers marks everything under /_site/* immutable for a year, the
      // asset layer's 404 included; a build that is not here (yet) must not
      // stay cached as missing.
      if (res.status !== 404) return res;
    }
    return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }

  async compose(response: Response, opts: ComposeOptions): Promise<Response> {
    return composeResponse(response, { ...opts, assetBase: this.env.ASSET_BASE ?? opts.assetBase }, build as Build);
  }

  /**
   * The homepage: GitHub Pages' response plus the theme head block. Anything
   * other than a 200 HTML answer to a GET passes through unchanged. Any error
   * before the page starts streaming serves Pages' response unchanged, and an
   * error this code does not catch passes the request through to the origin.
   */
  private async home(request: Request, url: URL): Promise<Response> {
    this.ctx.passThroughOnException();
    const origin = new URL(`${url.pathname}${url.search}`, this.env.HOME_ORIGIN);
    const upstream = () => fetch(new Request(origin, homeRequest(request)));
    if (request.method !== 'GET') return upstream();
    try {
      const res = await upstream();
      return composeResponse(res, { app: 'home', assetBase: this.env.ASSET_BASE ?? '/_site/' }, build as Build);
    } catch (err) {
      console.error('site-shell: homepage compose failed, serving GitHub Pages unchanged:', String(err));
      return upstream();
    }
  }
}

/**
 * The visitor's request as sent to Pages: manual redirects, so a Pages redirect
 * reaches the browser as one, and no conditional headers on a GET, so Pages
 * answers 200 with a page to compose (a composed page carries no validator, and
 * a 304 would revalidate a copy cached before this route existed).
 */
function homeRequest(request: Request): RequestInit {
  const headers = new Headers(request.headers);
  if (request.method === 'GET') {
    headers.delete('if-none-match');
    headers.delete('if-modified-since');
  }
  return { method: request.method, headers, body: request.body, redirect: 'manual' };
}

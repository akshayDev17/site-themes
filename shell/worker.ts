// The site-shell Worker.
//
// - RPC: an app's Worker calls env.SHELL.compose(response, { app, assetBase })
//   over a Service Binding and returns what comes back (see compose.ts).
// - Static assets: /_site/<build>/… are files in shell/public/, served by the
//   asset layer with a one-year immutable Cache-Control (public/_headers).
//   fetch() below runs only for paths that are not files: a missing /_site/
//   file, an app forwarding <prefix>/_site/… with its prefix already stripped,
//   /_site/apps.json and the homepage.
// - /_site/apps.json: the listed apps (src/apps.ts, built into build.json) for
//   the homepage's Apps cards where compose() does not run. Five minutes'
//   caching plus an ETag, so a list change shows within minutes of a deploy.
// - Routes (wrangler.jsonc): akshayprabhakant.com/_site/* and the exact
//   akshayprabhakant.com/. The homepage is composed from GitHub Pages and fails
//   open to the Pages response unchanged. It is served on HOME_ORIGIN's host
//   only: elsewhere (workers.dev, a preview URL) / is a 404 like any non-file.
import { WorkerEntrypoint } from 'cloudflare:workers';
import { composeResponse, type Build, type ComposeOptions } from './compose';
import generated from './generated/build.json';

const build: Build & { apps: { json: string; etag: string } } = generated;
/** Not a file under /_site/<id>/, so it is not immutable: see appsJson(). */
const APPS_JSON = '/_site/apps.json';

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
    if (url.pathname === APPS_JSON) return appsJson(request, build.apps);
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
    return composeResponse(response, { ...opts, assetBase: this.env.ASSET_BASE ?? opts.assetBase }, build);
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
      return composeResponse(res, { app: 'home', assetBase: this.env.ASSET_BASE ?? '/_site/' }, build);
    } catch (err) {
      console.error('site-shell: homepage compose failed, serving GitHub Pages unchanged:', String(err));
      return upstream();
    }
  }
}

/**
 * /_site/apps.json: a JSON array of the listed apps, { id, label, path, blurb,
 * gated }, in list order, the homepage first. GET and HEAD only; a matching
 * If-None-Match is a 304.
 */
function appsJson(request: Request, apps: { json: string; etag: string }): Response {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=300',
    etag: apps.etag,
    'x-content-type-options': 'nosniff',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' } });
  }
  const tags = request.headers.get('if-none-match');
  if (tags && (tags.trim() === '*' || tags.split(',').some((t) => t.trim().replace(/^W\//, '') === apps.etag))) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(request.method === 'HEAD' ? null : apps.json, { headers });
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

// The site-shell Worker.
//
// - RPC: an app's Worker calls env.SHELL.compose(response, { app, assetBase })
//   over a Service Binding and returns what comes back (see compose.ts).
// - Static assets: /_site/<build>/… are files in shell/public/, served by the
//   asset layer with a one-year immutable Cache-Control (public/_headers).
//   fetch() below runs only for paths that are not files: an app forwarding
//   <prefix>/_site/… with its prefix already stripped also lands here.
import { WorkerEntrypoint } from 'cloudflare:workers';
import { composeResponse, type Build, type ComposeOptions } from './compose';
import build from './generated/build.json';

export interface Env {
  ASSETS: Fetcher;
  /**
   * Set to '/_site/' once akshayprabhakant.com/_site/* routes here: every app's
   * pages then load the shared files from one URL, with no app change.
   */
  ASSET_BASE?: string;
}

export default class SiteShell extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/_site/build.json') {
      return Response.json({ id: build.id }, { headers: { 'cache-control': 'no-store' } });
    }
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
}

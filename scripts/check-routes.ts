// Checks, through the Cloudflare API, that the Worker in shell/wrangler.jsonc
// owns exactly the routes that config lists on each zone, and no others.
//
//   CLOUDFLARE_API_TOKEN=… node build/scripts/check-routes.js [shell/wrangler.jsonc]
//
// The deploy workflow runs it after `wrangler deploy`. It reads the zone's routes
// instead of fetching the public site, because Cloudflare's bot protection
// answers GitHub's runners with 403. The token is sent only as a header and is
// never printed. CLOUDFLARE_API_BASE overrides the API origin (tests only).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export interface Route {
  pattern: string;
  script?: string | null;
}

export interface RouteDiff {
  missing: string[];
  unexpected: string[];
}

interface ConfigRoute {
  pattern: string;
  zone_name: string;
}

/** The patterns `script` is expected to own that it does not, and the ones it owns that it should not. */
export function diffRoutes(expected: string[], routes: Route[], script: string): RouteDiff {
  const owned = routes.filter((r) => r.script === script).map((r) => r.pattern);
  return {
    missing: expected.filter((p) => !owned.includes(p)).sort(),
    unexpected: owned.filter((p) => !expected.includes(p)).sort(),
  };
}

/** The Worker name and its routes grouped by zone, from a wrangler.jsonc. */
export function readConfig(path: string): { name: string; zones: Map<string, string[]> } {
  const parsed = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
  if (parsed.error) throw new Error(`${path}: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n')}`);
  const config = parsed.config as { name?: unknown; routes?: unknown };
  if (typeof config.name !== 'string') throw new Error(`${path}: no Worker name`);
  const zones = new Map<string, string[]>();
  for (const route of (config.routes ?? []) as ConfigRoute[]) {
    if (typeof route?.pattern !== 'string' || typeof route?.zone_name !== 'string') {
      throw new Error(`${path}: every route needs a pattern and a zone_name`);
    }
    zones.set(route.zone_name, [...(zones.get(route.zone_name) ?? []), route.pattern]);
  }
  return { name: config.name, zones };
}

const ZONE_READ = 'the token needs Zone > Zone > Read on this zone';
const ROUTES_READ = 'the token needs Zone > Workers Routes > Read or Edit on this zone';

/** `permission` names what the token lacks when the API answers 403. */
async function api<T>(base: string, token: string, path: string, permission: string): Promise<T> {
  const res = await fetch(`${base}/client/v4${path}`, { headers: { authorization: `Bearer ${token}` } });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { code?: number; message?: string }[] };
  if (!res.ok || body.success === false) {
    const errors = (body.errors ?? []).map((e) => `${e.code ?? ''} ${e.message ?? ''}`.trim()).join('; ');
    const hint = res.status === 403 ? ` (${permission})` : '';
    throw new Error(`Cloudflare API ${path.split('?')[0]} answered HTTP ${res.status}${errors ? `: ${errors}` : ''}${hint}`);
  }
  return body.result as T;
}

async function main(): Promise<number> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    console.error('CLOUDFLARE_API_TOKEN is not set');
    return 1;
  }
  const base = process.env.CLOUDFLARE_API_BASE ?? 'https://api.cloudflare.com';
  const { name, zones } = readConfig(process.argv[2] ?? 'shell/wrangler.jsonc');
  let ok = true;
  for (const [zone, expected] of zones) {
    const found = await api<{ id: string }[]>(base, token, `/zones?name=${encodeURIComponent(zone)}`, ZONE_READ);
    if (found.length !== 1) {
      // A token without Zone Read on the zone can get an empty list rather than a 403.
      const hint = found.length === 0 ? ` (${ZONE_READ}, or the zone name is wrong)` : '';
      throw new Error(`zone ${zone}: expected one zone, the API listed ${found.length}${hint}`);
    }
    const routes = await api<Route[]>(base, token, `/zones/${found[0].id}/workers/routes`, ROUTES_READ);
    const { missing, unexpected } = diffRoutes(expected, routes, name);
    for (const p of expected.filter((p) => !missing.includes(p))) console.log(`ok: ${p} -> ${name}`);
    for (const p of missing) console.log(`missing: ${p} is not attached to ${name}`);
    for (const p of unexpected) console.log(`unexpected: ${p} is attached to ${name} but not in the config`);
    ok &&= missing.length === 0 && unexpected.length === 0;
  }
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    },
  );
}

// Builds site-shell's static files and the data the Worker inlines:
//
//   shell/public/_site/<id>/site.js     the picker (esbuild bundle of shell/client/site.ts)
//   shell/public/_headers               one-year immutable caching for /_site/*
//   shell/generated/build.json          { id, inline, scripts } read by the Worker
//
// The theme tokens are only inline (in build.json): a composed page needs no
// stylesheet request for its first paint.
//
// <id> is a content hash of everything a composed page gets from this build, so
// a release that changes any of it is a new URL. The newest KEEP released builds
// stay in public/_site/, so a page composed just before a deploy still finds its
// files (see shell-builds.ts).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { build as esbuild, transform } from 'esbuild';
import { buildBootScript } from '../src/boot.js';
import { generateCss, themeDeclarations } from '../src/css.js';
import { BASE_THEME_ID, THEMES } from '../src/themes.js';
import { keptBuilds, parseBuilds } from './shell-builds.js';

const KEEP = 3;
const root = new URL('../../', import.meta.url);
const shell = new URL('shell/', root);
const site = new URL('public/_site/', shell);

// generateCss() validates the catalogue; the inline copy is the same blocks,
// compacted, with the base theme's block shared by :root (as the apps' CSS
// minifier already does with the bundled copy).
generateCss(THEMES);
const block = (selector: string, t: (typeof THEMES)[number]) =>
  `${selector}{color-scheme:${t.scheme};${themeDeclarations(t).map(([k, v]) => `${k}:${v}`).join(';')}}`;
const tokens = THEMES.map((t) => block(t.id === BASE_THEME_ID ? `:root,[data-theme="${t.id}"]` : `[data-theme="${t.id}"]`, t)).join('');
// Minified like the Next apps' copy (their bundler minifies the inline string).
const boot = (await transform(buildBootScript(), { minify: true, target: 'es2015' })).code.trim();
const inline = `<script data-site-shell>${boot}</script><style data-site-shell>${tokens}</style>`;

const bundle = await esbuild({
  entryPoints: [new URL('client/site.ts', shell).pathname],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const siteJs = bundle.outputFiles[0].text;

const id = createHash('sha256').update(inline).update('\0').update(siteJs).digest('hex').slice(0, 12);

mkdirSync(new URL(`${id}/`, site), { recursive: true });
writeFileSync(new URL(`${id}/site.js`, site), siteJs);
writeFileSync(
  new URL('public/_headers', shell),
  ['/_site/*', '  Cache-Control: public, max-age=31536000, immutable', '  X-Content-Type-Options: nosniff', ''].join('\n'),
);

// Release order, newest last, as committed at HEAD; the working copy only when
// builds.txt is not committed yet.
const orderFile = new URL('generated/builds.txt', shell);
const released = (() => {
  try {
    return parseBuilds(execFileSync('git', ['show', 'HEAD:shell/generated/builds.txt'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch {
    return existsSync(orderFile) ? parseBuilds(readFileSync(orderFile, 'utf8')) : [];
  }
})();
const kept = keptBuilds(released, id, KEEP);
mkdirSync(new URL('generated/', shell), { recursive: true });
for (const dir of readdirSync(site, { withFileTypes: true })) {
  if (dir.isDirectory() && !kept.includes(dir.name)) rmSync(new URL(`${dir.name}/`, site), { recursive: true, force: true });
}
writeFileSync(orderFile, kept.join('\n') + '\n');

writeFileSync(new URL('generated/build.json', shell), JSON.stringify({ id, inline, scripts: ['site.js'] }, null, 2) + '\n');
// The one-time safety net each app copies into its own CSS: Classic Light at
// zero specificity, so it applies only when compose() did not run.
const base = THEMES.find((t) => t.id === BASE_THEME_ID)!;
writeFileSync(new URL('generated/fallback.css', shell), `/* site-shell fallback: Classic Light when the shared tokens are missing. */\n${block(':where(:root)', base)}\n`);

console.log(`site-shell build ${id}: inline ${Buffer.byteLength(inline)} B, site.js ${Buffer.byteLength(siteJs)} B; kept ${kept.join(', ')}`);

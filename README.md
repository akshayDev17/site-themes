# site-themes

Shared themes for the akshayprabhakant.com apps (homepage, chat archive, quiz, graph notes, election atlas), delivered two ways from one catalogue (`src/themes.ts`):

- **The build-time package** (`dist/`, everything up to [site-shell](#site-shell)). Each app installs a pinned git tag and bundles the themes into its own build, so nothing is fetched when a page loads. Every app uses it today.
- **site-shell** (`shell/`), a Cloudflare Worker that adds the theme to each app's HTML as it streams out, so one release reaches every app at its next page view. It is not routed and no app binds it yet; see [site-shell](#site-shell).

Installing the package from git still copies only `dist/` (`"files"` in `package.json`), so site-shell changes never reach an app through the package and need no tag.

## What it exports

| Import | What it is |
|---|---|
| `site-themes/themes.css` | Generated CSS: Classic Light on `:root`, then one `[data-theme="<id>"]` block per theme, each setting `color-scheme`. |
| `site-themes` (or `site-themes/themes`) | The catalogue: `THEMES`, `THEME_IDS`, `SYSTEM_THEMES`, plus the TypeScript types. |
| `bootScript` from `site-themes` (or `site-themes/boot`) | The inline head script as a string. Each app inlines it into its own `<head>`, where it sets `<html data-theme>` before first paint. |
| `defineThemePicker()` from `site-themes` (or `site-themes/picker`) | Registers the `<site-theme-picker>` custom element. It has no framework dependency. |
| `ThemePicker` from `site-themes/react` | A thin React wrapper around the element (`'use client'`). |
| `setThemeChoice()`, `readThemeChoice()` | For an app that wants its own toggle UI instead of the picker. |

## Themes

| id | Label | Scheme | Source |
|---|---|---|---|
| `classic-light` | Classic Light | light | Today's shared palette (home, quiz, chat archive, atlas) |
| `classic-dark` | Classic Dark | dark | Classic inverted. The Classic ink becomes the surface. |

The picker offers **System** (the default), **Classic Light** and **Classic Dark**. System maps to Classic Light or Classic Dark through `prefers-color-scheme`.

**What a theme may change:** colour roles and `color-scheme`, elevation (shadows), shape (card radius), and fonts. Fonts must come from `VETTED_FONTS`, and the build rejects anything else.
**What a theme must not change:** layout, spacing, type sizes, DOM order, and data colours (party colours, graph cluster colours). There are no tokens for these, so a theme cannot change them.

## Tokens

| Role | CSS custom property |
|---|---|
| Surfaces | `--surface`, `--surface-2`, `--card` |
| Text | `--text`, `--text-body`, `--text-muted` |
| Lines | `--line`, `--line-strong`, `--card-line`, `--card-line-hover` |
| Accent and status | `--accent`, `--focus`, `--danger`, `--warn`, `--ok` |
| Elevation and shape | `--shadow-rest`, `--shadow-hover`, `--radius-card` |
| Fonts | `--font-serif`, `--font-mono` |

Every theme sets every colour role. Shadow, radius and fonts are optional per theme. A theme that leaves one out inherits Classic Light's value from `:root`.

An app keeps its own variable names through a one-time alias block placed after `themes.css`. The fallback inside `var()` is the Classic Light value:

```css
:root {
  --paper: var(--surface, #EEF1F8);
  --paper-2: var(--surface-2, #E2E8F4);
  --ink: var(--text, #0F1220);
  --muted: var(--text-muted, #525A6B);
}
```

Do not redefine the package's own names (`--accent`, `--card`, `--text`, …) in app CSS. A later `:root { --accent: … }` has the same specificity as `[data-theme]` and would override every theme. Delete those definitions, or alias them under a different name.

## Shared convention

- One `localStorage` key, **`site-theme`**, on the single origin `https://akshayprabhakant.com`. Its value is `system` (the default) or a theme id. Every app on the origin reads the same key, so a choice made in one app carries over to the next with no signal between apps.
- **System** maps to `classic-light` or `classic-dark` through `prefers-color-scheme`, and follows OS changes live.
- An unknown stored id falls back to System, for example a theme removed in a later release or a typo. So do a missing key and storage that is missing or throws. See the [Changelog](#changelog) for removed theme ids.
- Open tabs follow a change through the `storage` event. Pickers on the same page stay in sync through a `site-theme-change` window event.
- `data-theme` always holds the resolved theme id. In System mode that is `classic-light` or `classic-dark`, never `system`.

Accepted limits: the Cloudflare Access login pages cannot follow the theme. An installed graph-notes on iOS keeps its own storage. `http://` and `www.` are separate origins, so they keep separate choices.

## Install (pin a git tag)

Install straight from GitHub. The npm registry is not involved, and the package is never published there (`"private": true`).

```sh
npm install github:akshayDev17/site-themes#v0.2.0
```

This writes `"site-themes": "github:akshayDev17/site-themes#v0.2.0"` into the app's `package.json`.

**Built output is committed.** `dist/` (JS, `.d.ts` and `themes.css`) is checked in, and the package has no `prepare` or `install` script. A git install therefore copies ready files with no build step, and no TypeScript runs on the app side. CI fails any PR whose committed `dist/` does not match a fresh build.

## Wiring a Next.js app (static export)

```tsx
// app/layout.tsx
import 'site-themes/themes.css';          // before the app's own CSS
import './globals.css';
import { IBM_Plex_Mono, Newsreader } from 'next/font/google';
import { bootScript } from 'site-themes';

const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// in a header component
import { ThemePicker } from 'site-themes/react';
<ThemePicker hideLabel />
```

The next/font `.variable` classes (`--font-newsreader` and `--font-plex-mono`) must go on `<html>`, not `<body>`. `--font-serif` and `--font-mono` are declared on `:root` and `[data-theme]`, which is `<html>`, and their `var()` resolves there. On `<body>` the variables are undefined at `<html>`, so the fonts silently fall back to Georgia and ui-monospace.

`suppressHydrationWarning` is needed because the boot script sets `data-theme` on `<html>` before React hydrates. The picker draws into its shadow root, so hydration never sees its children.

## Wiring a plain static page (homepage)

The boot script must be inline in `<head>`, never a `<script src>`: the theme is set before first paint with no request. In the site's build step, write the exported `bootScript` text into the page and copy `node_modules/site-themes/dist/` into the site's own assets:

```js
// build step (Node)
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { bootScript } from 'site-themes';

cpSync('node_modules/site-themes/dist', 'out/assets/site-themes', { recursive: true });
const html = readFileSync('src/index.html', 'utf8');
writeFileSync('out/index.html', html.replace('<!-- site-theme-boot -->', `<script>${bootScript}</script>`));
```

```html
<head>
  <!-- site-theme-boot -->   <!-- replaced by the inline boot script; keep it first in <head> -->
  <link rel="stylesheet" href="/assets/site-themes/themes.css">
</head>
<body>
  <site-theme-picker></site-theme-picker>
  <script type="module">
    import { defineThemePicker } from '/assets/site-themes/picker.js';
    defineThemePicker();
  </script>
</body>
```

The page serves its own copy. No other app links to it.

## Picker

`<site-theme-picker>` is a labelled native `<select>` that lists System plus every catalogue theme. It is keyboard accessible and at least 24 px tall. It styles itself from the tokens.

- Attributes: `label="…"` sets the label text (default "Theme"). `hide-label` keeps the label for screen readers only.
- Styling: use `site-theme-picker::part(select)` and `::part(label)`.
- Importing the module does not touch the DOM, so server-side rendering is safe. Call `defineThemePicker()` on the client. The React wrapper does this in an effect.

## Contrast gate

CI computes WCAG contrast for every theme and fails below the thresholds in report section 3.5.5:

| Foreground | Background | Minimum |
|---|---|---|
| text, textBody, textMuted | surface, surface2, card | 4.5:1 |
| accent | surface, surface2, card | 4.5:1 |
| cardLine | surface, card | 3:1 |
| focus | surface, surface2, card | 3:1 |

A card's border separates the card from the page it sits on, so `cardLine` is gated against `surface` and `card` only, not `surface2`. A card or control bordered with `--card-line` that sits on `surface2` must carry a `--card` background. The picker's `<select>` always does. `line` and `lineStrong` are decorative dividers and exempt. Run the gate locally with `npm run check:contrast`. It prints every pair.

## Adding a theme

1. Add one entry to `THEMES` in `src/themes.ts`.
2. `npm run build && npm test && npm run check:contrast`, then commit, including `dist/`.
3. Merge, then tag a release (see below).

The CSS, the boot script's id list and the picker's options all derive from the catalogue.

## Releases and version-bump PRs

- A release is a git tag `vX.Y.Z` on `main`, matching `version` in `package.json`. Nothing is published to npm.
- Each app pins a tag in its `package.json` and gets an automated bump PR when a newer tag lands. The recommended setup is Renovate in each app. Its npm manager updates `github:owner/repo#vX.Y.Z` dependencies to newer semver tags. A small scheduled workflow that compares the pinned tag with `gh api repos/akshayDev17/site-themes/tags` and opens a PR also works.
- Each app sets up its bump automation in its own wiring PR. It does not live in this repository.
- After a bump, the app rebuilds and redeploys. That is the only way a new theme reaches it, because nothing is fetched at runtime.

## site-shell

site-shell is the shared Worker that composes the theme into every app's HTML (theme only for now; navigation comes later). It is built from the same catalogue, boot script and picker as the package.

**Status:** it has no route and no app binds it yet, so it serves no production traffic. `akshayprabhakant.com/_site/*` and the exact `/` route are proposals awaiting approval.

### What compose() adds

An app's Worker hands each HTML response to site-shell over a Service Binding: `env.SHELL.compose(response, { app, assetBase })`. site-shell streams it through `HTMLRewriter` and adds, as the first children of `<head>` (right after a leading `<meta charset>`, which must stay in the first 1024 bytes):

1. the boot script, inline (the same one the package exports), so `<html data-theme>` is set before first paint;
2. the theme tokens, inline (`:root,[data-theme="classic-light"]{…}[data-theme="classic-dark"]{…}`), so even a first visit has no flash and no extra request;
3. `<script defer src="<assetBase><build>/site.js">`, which defines `<site-theme-picker>`. The app keeps placing the element itself.

Nothing else in the page changes. Responses that are not `200 text/html` pass through untouched. Composed pages drop `ETag` and `Last-Modified`, because the page now depends on the site-shell build too, and carry `x-site-shell: <build>; app=<app>`.

### Files at /_site/\<build\>/

`npm run build` writes `shell/public/_site/<build>/site.js`, where `<build>` is a content hash of everything a composed page gets from that build. There is no stylesheet: the tokens are inline in the composed page, so its first paint needs no request. `shell/public/_headers` serves them with `Cache-Control: public, max-age=31536000, immutable`. The newest 3 released builds are kept, so a page composed just before a deploy still finds its files. Released means listed in `shell/generated/builds.txt` on `main` (at the branch's merge-base with `origin/main`), since only `main` deploys: a build appends its id to that list, so builds made on a branch, committed or not, never take a slot from a deployed build or push it out. A missing build answers `404` with `no-store`, so it is never cached as missing.

Until `akshayprabhakant.com/_site/*` is routed to site-shell, each app forwards `<its prefix>/_site/…` to `env.SHELL.fetch()` through its own route, and passes that prefix as `assetBase`.

### Wiring an app

1. **Deploy order:** site-shell must be deployed before an app adds the binding, or the app's deploy fails.
2. In the app's `wrangler.jsonc`: `"services": [{ "binding": "SHELL", "service": "site-shell" }]`. The election atlas also lists its four HTML pages and `/elections/india/_site/*` in `assets.run_worker_first`.
3. In the app's Worker, pass each page through this hook, and forward `/_site/` (see `shell/test-harness/apps/` for the chat, quiz, graph and atlas Workers with the hook in place):

   ```js
   // Fail open: unbound, failing or unreachable site-shell serves the page exactly as built.
   // The body went to site-shell with the call, so the fallback fetches the page again
   // (a static asset: free). Returning the original response here answers 500 instead.
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
   ```

4. Copy `shell/generated/fallback.css` (Classic Light under `:where(:root)`) into the app's own CSS. The apps use tokens such as `--accent` and `--card` with no `var()` fallback. If compose is ever skipped, this block keeps the page in Classic Light, and it has zero specificity, so it never overrides a theme.
5. When the app drops the package: remove `bootScript`, the `themes.css` import and `ThemePicker`, render `<site-theme-picker hide-label="">` directly, and remove the dependency and its bump automation.

### Failure behaviour

| Failure | The visitor gets |
|---|---|
| No `SHELL` binding, site-shell not deployed or unreachable, or `compose()` throws | the page exactly as built (after step 4, in Classic Light, with no picker) |
| An edit throws while the page streams | that edit is skipped; every handler is guarded |
| A platform fault after the response has started (for example a CPU limit) | an error or a cut-short page: no hook can recover once streaming has begun |

### Releases

A change to `src/` or `shell/` is one PR. CI builds and tests it, and the `site-shell` workflow uploads a preview version for the PR. Merging deploys it, and every app that binds `SHELL` serves it at its next page view. Roll back with `wrangler rollback`. **Do not tag for site-shell-only changes:** a tag opens a bump PR in every app still on the package.

### Deploying site-shell

`.github/workflows/site-shell.yml` has three triggers:
- **PRs from this repository:** uploads a preview version (`wrangler versions upload --preview-alias pr-<n>`), which is not deployed. It answers at `https://pr-<n>-site-shell.<subdomain>.workers.dev`.
- **Pushes to `main`:** deploys (`wrangler deploy`), to workers.dev only.
- **A manual run on `main`:** also deploys.

It reads these from the GitHub environment `production`, which the owner manages:

| Name | Kind | Value |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | environment secret | the Cloudflare deploy token the app repos use |
| `CLOUDFLARE_ACCOUNT_ID` | environment secret | the account id the app repos use |
| `WORKERS_DEV_SUBDOMAIN` | environment or repository variable | the account's workers.dev subdomain; the smoke test checks `https://site-shell.<subdomain>.workers.dev` |

Until both secrets exist, the job reports a notice, skips everything after its check, and stays green; CI is unaffected. Once they exist, run the workflow on `main` (Actions → site-shell → Run workflow) to deploy without waiting for the next change.

### Developing site-shell

```sh
npm test                                        # includes the site-shell build, its unit tests and the Worker typecheck
node shell/test-harness/make-fixtures.mjs       # harness apps' asset dirs from shell/test-harness/fixtures/
npm run test:shell                              # wrangler dev sessions: each app's page composed byte for byte, fail-open cases
npm run dev:shell                               # site-shell alone on localhost
```

The harness runs on local workerd with no Cloudflare account. Each scenario is one `wrangler dev -c <app> -c <shell>` session with a private dev registry, because otherwise a site-shell left running by any other session would answer the binding. The homepage, chat and atlas fixtures are the public pages' HTML and CSS saved on 2026-11-03. Quiz and graph notes sit behind Access, so their fixtures are the index pages of a local static build of each app's `frontend/` from its `main` branch (see `make-fixtures.mjs`). The homepage has no Worker (GitHub Pages serves it), so its harness Worker stands in for one on the proposed `/` route. The boot string is built in Node by `scripts/build-shell.ts`, never by `Function#toString()` inside the Worker bundle: wrangler's default `keep_names` would put `__name(...)` calls inside it, and those calls do not exist in a browser.

## Changelog

- **Unreleased**: added site-shell (`shell/`, `scripts/build-shell.ts`), the theme-only composition Worker. The package (`dist/`) is unchanged, so no tag is needed.
- **0.2.0**: removed the Slate Light (`slate-light`) and Slate Dark (`slate-dark`) themes. The catalogue is now Classic Light and Classic Dark, with System as the default. A stored slate id falls back to System (Classic Light or Classic Dark through `prefers-color-scheme`). Every export and token name is unchanged, so an app bumps with no code change.
- **0.1.0**: first release, with Classic Light, Classic Dark, Slate Light and Slate Dark.

## Development

```sh
npm ci
npm test                 # build (tsc + generate dist/) and run unit tests (node:test, jsdom)
npm run check:contrast   # the contrast gate
```

Layout: `src/themes.ts` holds the catalogue, `src/css.ts` generates the CSS, `src/contrast.ts` holds the gate, `src/boot.ts` the head script, `src/picker.ts` the custom element and `src/react.ts` the wrapper. `scripts/` writes the non-TS outputs into `dist/` and site-shell's build into `shell/generated/` and `shell/public/`. `shell/` holds the site-shell Worker (`worker.ts`, `compose.ts`, `client/site.ts`, `wrangler.jsonc`) and its harness (`test-harness/`).

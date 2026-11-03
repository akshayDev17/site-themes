# site-themes

Shared themes for the akshayprabhakant.com apps (homepage, chat archive, quiz, graph notes, election atlas), delivered two ways from one catalogue (`src/themes.ts`):

- **The build-time package** (`dist/`, everything up to [site-shell](#site-shell)). Each app installs a pinned git tag and bundles the themes into its own build, so nothing is fetched when a page loads. Every app uses it today.
- **site-shell** (`shell/`), a Cloudflare Worker that adds the theme and the site navigation to each app's HTML as it streams out, so one release reaches every app at its next page view. It serves the shared files at `akshayprabhakant.com/_site/*` and composes the homepage (`/`); no app binds it yet. See [site-shell](#site-shell).

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

`<site-theme-picker>` is a labelled select-only combobox (the [WAI-ARIA APG pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/)) that lists System plus every catalogue theme. It is at least 24 px tall and styles itself from the tokens.

- The control: the current choice and a chevron, the chevron 11 px in from the right edge and vertically centred, the text kept 8 px clear of it. It is as wide as its longest label whatever the choice, so nothing around it moves when the theme changes.
- The open list is drawn by the element, not the browser, so it looks the same in every theme and browser. It uses the control's font, size, letter spacing, colours, radius and border (an app's `::part(select)` type carries over), and opens just under the control (above it when there is no room). The option under the pointer or keyboard gets a wash of `--text` in `--card` plus a 2 px `--focus` ring, which reaches 3:1 on the list in every theme; in forced-colors mode it is a `Highlight` outline instead. The chosen option carries a check mark.
- Keyboard: Down, Up, Enter or Space opens the list on the chosen option, and Home or End opens it on the first or last option. With the list open, the arrows, Home/End and PageUp/PageDown move the highlight. Enter or Space chooses and closes, Escape closes without choosing, and Tab chooses and moves on. Typing a label's first letters jumps to it. Focus stays on the control throughout, and `aria-activedescendant` names the highlighted option. A press outside closes the list.
- A click on the label focuses the control, as it would a native `<select>`.
- Attributes: `label="…"` sets the label text (default "Theme"). `hide-label` keeps the label for screen readers only.
- Styling: use `site-theme-picker::part(select)` (the control) and `::part(label)`. The open list takes its look from the control.
- Importing the module does not touch the DOM, so server-side rendering is safe. Call `defineThemePicker()` on the client. The React wrapper does this in an effect.

## Contrast gate

CI computes WCAG contrast for every theme and fails below the thresholds in report section 3.5.5:

| Foreground | Background | Minimum |
|---|---|---|
| text, textBody, textMuted | surface, surface2, card | 4.5:1 |
| accent | surface, surface2, card | 4.5:1 |
| cardLine | surface, card | 3:1 |
| focus | surface, surface2, card | 3:1 |

A card's border separates the card from the page it sits on, so `cardLine` is gated against `surface` and `card` only, not `surface2`. A card or control bordered with `--card-line` that sits on `surface2` must carry a `--card` background. The picker's control and its open list always do. `line` and `lineStrong` are decorative dividers and exempt. Run the gate locally with `npm run check:contrast`. It prints every pair.

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

site-shell is the shared Worker that composes the theme, and the site navigation where a page asks for it, into every app's HTML. It is built from the same catalogue, boot script and picker as the package, and from the app list (`src/apps.ts`).

**Status:** it has exactly two routes, both approved by the owner: `akshayprabhakant.com/_site/*` (the shared files) and the exact `akshayprabhakant.com/` (the homepage, see [The homepage](#the-homepage)). No app binds it yet. The catch-all `akshayprabhakant.com/*` is not routed and must not be.

### What compose() adds

An app's Worker hands each HTML response to site-shell over a Service Binding: `env.SHELL.compose(response, { app, assetBase })`. site-shell streams it through `HTMLRewriter` and adds, as the first children of `<head>` (right after a leading `<meta charset>`, which must stay in the first 1024 bytes):

1. the boot script, inline (the same one the package exports), so `<html data-theme>` is set before first paint;
2. the theme tokens, inline (`:root,[data-theme="classic-light"]{…}[data-theme="classic-dark"]{…}`), so even a first visit has no flash and no extra request;
3. `<script defer src="<assetBase><build>/site.js">`, which defines `<site-theme-picker>` (the app keeps placing the element itself) and, where the site row scrolls, starts it with the current app in view and fades the edge that has more apps past it.
4. on an [unlisted](#the-app-list) app's pages only: `<meta name="robots" content="noindex">`.

It also fills two elements an app may place in its body, from the [app list](#the-app-list):

| Slot | What compose() puts inside it |
|---|---|
| `<site-slot name="site-path" data-tail='[{"label":"India","href":"/elections/india/"}]'>` | The site row, `Home  AI Digest  Quiz Room  Graph Notes  Election Atlas` (`<nav aria-label="Site">`), and under it, on its own line, the page's trail (`<nav aria-label="Breadcrumb">`), such as `Quiz Room › History` or `Election Atlas › India › Uttar Pradesh`. Every app in the row is a link to its root; the current app is in ink and underlined, with `aria-current="page"` at the app's root and `aria-current="true"` below it. `data-tail` is the app's own crumbs after its name, as JSON; the last one is the current page, and each `href` must be a path on this site. The trail is those crumbs led by the app itself (a link to its root), unless the first crumb already links to the app's root (the atlas's "India", `/elections/india/`, does not: the atlas's root is `/elections/`, so its national page reads `Election Atlas › India`); its last crumb is plain text with `aria-current="page"`. There is no trail at an app's root (an empty `data-tail`), nor when it would be a single crumb. The row is one line everywhere: inline where it fits, and where it does not (a portrait phone) it scrolls sideways with no scrollbar drawn, starting with the current app in view and fading the edge that has more apps past it. |
| `<site-slot name="site-apps">` | The listed apps other than the homepage, as a `<ul class="site-apps">` of links (name, blurb, `data-app`, `data-gated`), for the homepage Apps cards. |

- The `<site-slot>` element and its attributes stay; only its content is replaced. Whatever the app puts inside it is the fallback that shows when compose() does not run, for example the app's own back link.
- **A page with no slot gets no navigation at all**, so an app that has not placed one is unchanged.
- Each slot carries its own small `<style>`; there is no extra request. The row is Newsreader (`--font-serif`) at 15 px and the trail at 14 px, in sentence case; they use only theme tokens and mark the current app in `--text`, never the accent. Every link in the row is at least 44 px tall; the trail's links are 32 px. The "›" between crumbs is drawn by CSS, so screen readers hear a plain list.
- No lock is drawn anywhere. A gated app shows its name alone; screen readers hear "<app> (sign-in required)", from visually hidden text, so its accessible name still starts with the visible label.
- An app that redraws the slot after a client-side navigation keeps the row's behaviour: `site.js` picks up a row added later. `npm run test:row` checks the row and trail in headless Chrome at 1440x900, 1280x800, 844x390 and 390x844 in both themes: one line of 44 px targets, the current app in view, the trail under the row, the fade, 4.5:1 text, and no sideways page scroll, even in a box sized by its content (`CHROME_PATH` picks the browser; `ROW_SHOTS=<dir>` saves page captures).
- Each slot name is filled once per page. An unknown slot name, an app id missing from the list, or a malformed `data-tail` leaves the slot as the app wrote it (the last one logs `site-shell: handler skipped`).
- In a React app, hydration must not replace the slot's content. Render the slot with `dangerouslySetInnerHTML` (the fallback) and `suppressHydrationWarning`, then check the page after hydration.

### The app list

`src/apps.ts` is the one place every app is listed: `id` (what the app's Worker passes as `compose({ app })`), `label`, `path`, a one-line `blurb`, `gated` and `listed`. The first entry is the homepage, `home`, labelled "Home". Order there is order everywhere. The owner controls it: a change is a PR to this repository, and once it is merged the deploy reaches every composed page at its next view. `npm run build` rejects a list with a duplicate or malformed id, an empty label, a path that does not start with a single `/`, or a first entry that is not a listed `home` at `/`.

| `listed` | The row on other apps and the homepage list | The app's own pages |
|---|---|---|
| `true` | shown | indexed as usual |
| `false` (unlisted) | **not shown** | the row still shows it, tagged "Not listed"; `noindex`; direct links keep working |

The same list is served as JSON at **`https://akshayprabhakant.com/_site/apps.json`**, for a page compose() does not reach: GitHub Pages serves `/?…` and `/index.html` bare (only the exact `/` is routed), and they must still show the Apps cards without a hand-kept copy of the list. It is an array of every listed app in list order, the homepage first, with exactly the fields the cards render (the homepage list is the entries other than `home`); unlisted apps are left out:

```json
[{"id":"home","label":"Home","path":"/","blurb":"Work, research and contact","gated":false},
 {"id":"chat","label":"AI Digest","path":"/chat-archives","blurb":"AI chat sessions filed as a newspaper","gated":false}, …,
 {"id":"atlas","label":"Election Atlas","path":"/elections/","blurb":"Election results by country","gated":false}]
```

`npm run build` writes it, with its ETag, into `shell/generated/build.json`. It answers `GET` and `HEAD` with `Content-Type: application/json; charset=utf-8`, `Cache-Control: public, max-age=300` and a strong `ETag` (a matching `If-None-Match` is a `304`), so a merged list change shows within five minutes of the deploy. Other methods get `405`.

Unlisting is not locking. To make an app private, put it behind Cloudflare Access; `gated: true` only adds the hidden "(sign-in required)" text. `src/apps.ts` is compiled into `dist/` like the rest of `src/`, but the package does not export it, so it needs no tag.

Nothing else in the page changes: outside the head block and the slots above, the page is byte for byte as the app built it. Responses that are not `200 text/html` pass through untouched. Composed pages drop `ETag` and `Last-Modified`, because the page now depends on the site-shell build too, and carry `x-site-shell: <build>; app=<app>`.

### Files at /_site/\<build\>/

`npm run build` writes `shell/public/_site/<build>/site.js`, where `<build>` is a content hash of everything a composed page gets from that build. There is no stylesheet: the tokens are inline in the composed page, so its first paint needs no request. `shell/public/_headers` serves them with `Cache-Control: public, max-age=31536000, immutable`. The newest 3 released builds are kept, so a page composed just before a deploy still finds its files. Released means listed in `shell/generated/builds.txt` on `main` (at the branch's merge-base with `origin/main`), since only `main` deploys: a build appends its id to that list, so builds made on a branch, committed or not, never take a slot from a deployed build or push it out. A missing build answers `404` with `no-store`, so it is never cached as missing.

`akshayprabhakant.com/_site/*` routes to site-shell, and its `ASSET_BASE` variable (`/_site/`) makes every composed page load these files from that one URL, whatever `assetBase` the app passes. Any other path under `/_site/`, except [`/_site/apps.json`](#the-app-list), answers `404` with `no-store`. An app may still forward `<its prefix>/_site/…` to `env.SHELL.fetch()` through its own route; that keeps working, and it is what pages use if `ASSET_BASE` is ever unset.

### The homepage

The homepage is built and served by GitHub Pages; site-shell sits in front of it on the exact `/` route only. For a `GET /` it fetches the same URL from `HOME_ORIGIN` (`https://akshayprabhakant.com`; a Worker's fetch to its own zone goes to the DNS origin, GitHub Pages, never back to a Worker) and composes the answer exactly as for an app (`app: 'home'`): the head block after `<meta charset="utf-8">` and any [slots](#site-shell) the page places filled, nothing else changed, Pages' headers kept except `ETag` and `Last-Modified`.

- It asks Pages with redirects left manual and without `If-None-Match` or `If-Modified-Since`, so a Pages redirect reaches the browser as one and a GET always gets a page to compose.
- Anything that is not a `200 text/html` answer to a `GET` (a `HEAD`, a redirect, a Pages error) passes through unchanged.
- **Fail open:** any error before the page starts streaming serves Pages' response unchanged, and an uncaught error passes the request through to the origin (`passThroughOnException`).
- A route pattern matches the whole URL, query included, so `/?anything` is not routed: GitHub Pages serves it directly, as before.
- The homepage still bundles site-themes v0.2.0. The composed boot runs first and sets `__siteThemeBoot`, so the bundled boot does nothing; the bundled picker module sees `<site-theme-picker>` already defined and does nothing. Removing the homepage's copy of the package is a later homepage change.
- The homepage is served only for `HOME_ORIGIN`'s host. On workers.dev or a preview URL, `/` answers `404` with `no-store` like any other path that is not a file, so there is no second copy of the homepage; check homepage changes, fail open included, with the local harness.

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
| A slot cannot be filled (malformed `data-tail`, an app missing from the list) | that slot keeps the app's fallback content; the rest of the page is composed |
| A platform fault after the response has started (for example a CPU limit) | an error or a cut-short page: no hook can recover once streaming has begun |
| The homepage: fetching or composing fails before the page streams | GitHub Pages' response, unchanged |
| The homepage: an uncaught error in site-shell | the request passes through to GitHub Pages |

**Rollback of the routes:** detach `akshayprabhakant.com/_site/*` and `akshayprabhakant.com/` from site-shell in the Cloudflare dashboard (Workers & Pages → site-shell → Settings → Domains & Routes). The homepage is then GitHub Pages again and `/_site/` is a Pages 404. Also remove them from `shell/wrangler.jsonc`: `wrangler deploy` attaches the routes the config lists, and a config with no routes leaves attached routes in place, so removing them from the config alone does not detach them.

### Releases

A change to `src/` or `shell/` is one PR. CI builds and tests it, and the `site-shell` workflow uploads a preview version for the PR. Merging deploys it, and the homepage and every app that binds `SHELL` serve it at their next page view. Roll back with `wrangler rollback`, but while the two routes are attached, never to a version older than the one that added them: those versions answer `/` with `404`, so the homepage would go down. To roll back past it, first detach the routes as in [Rollback of the routes](#failure-behaviour). **Do not tag for site-shell-only changes:** a tag opens a bump PR in every app still on the package.

### Deploying site-shell

`.github/workflows/site-shell.yml` has three triggers:
- **PRs from this repository:** uploads a preview version (`wrangler versions upload --preview-alias pr-<n>`), which is not deployed. It answers at `https://pr-<n>-site-shell.<subdomain>.workers.dev`, where `/` is a `404` (the homepage is served only on `HOME_ORIGIN`'s host), so homepage composition and fail open are checked in the local harness. Until the Worker exists, the run skips the upload with a notice; the first merge to `main` creates it.
- **Pushes to `main`:** deploys (`wrangler deploy`): workers.dev and the two routes in `shell/wrangler.jsonc`. Attaching routes needs the deploy token to have Zone > Workers Routes > Edit on the `akshayprabhakant.com` zone; without that the deploy fails at the routes step, after uploading the Worker, and the routes stay unattached. After deploying, the run smoke-tests workers.dev (`/_site/<build>/site.js` is served immutable, and a missing `/_site/` file answers `404` with `no-store`) and then checks the attachment through the Cloudflare API (`scripts/check-routes.ts`): the zone's Worker routes must give site-shell exactly the routes `shell/wrangler.jsonc` lists, and no others. That check also needs Zone > Zone > Read on the zone, to look it up by name (listing its routes needs Zone > Workers Routes > Read or Edit, which the Edit above covers); without it the check fails and names the missing permission. It does not fetch the public site, because the zone's bot protection answers GitHub's runners with 403, so CI does not check that `/` is composed by this build (`x-site-shell`); the owner's live check after each phase does.
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
npm run test:picker                             # the theme picker in headless Chrome, both themes (PICKER_SHOTS_DIR keeps the open-list PNGs)
npm run dev:shell                               # site-shell alone on localhost
```

The harness runs on local workerd with no Cloudflare account. Each scenario is one `wrangler dev -c <app> -c <shell>` session with a private dev registry, because otherwise a site-shell left running by any other session would answer the binding. The homepage, chat and atlas fixtures are the public pages' HTML and CSS saved on 2026-11-03. Quiz and graph notes sit behind Access, so their fixtures are the index pages of a local static build of each app's `frontend/` from its `main` branch (see `make-fixtures.mjs`). The homepage tests run site-shell itself with `HOME_ORIGIN` pointed at a local stand-in for GitHub Pages that serves the saved homepage, and requests addressed to that host (`--local-upstream`); fail open is shown with `shell-bad-asset-base.jsonc`, whose `ASSET_BASE` compose() rejects. The boot string is built in Node by `scripts/build-shell.ts`, never by `Function#toString()` inside the Worker bundle: wrangler's default `keep_names` would put `__name(...)` calls inside it, and those calls do not exist in a browser.

## Changelog

- **Unreleased**: the picker is a custom select-only combobox instead of a native `<select>`, so its open list matches the control in every theme and browser, and its chevron has proper inner padding. Earlier: the site path becomes the plain site row, `Home  AI Digest  Quiz Room  Graph Notes  Election Atlas` (the homepage is labelled "Home"), with no site name, no "/ Portfolio" crumb and no phone sheet: the page's trail is its own line under the row, the row scrolls sideways where it does not fit, and no lock is drawn (gated apps keep a hidden "(sign-in required)"). Election Atlas links to `/elections/` ("Election results by country") and is the current app on every `/elections/…` page. Earlier: `/_site/apps.json`, the listed apps as JSON for the bare GitHub Pages homepage (`/?…`, `/index.html`). Earlier: the app list (`src/apps.ts`), and compose() fills `<site-slot name="site-path">` with the site path switcher and `<site-slot name="site-apps">` with the homepage list; an unlisted app's pages are `noindex`. Pages without a slot are unchanged. Earlier: site-shell is routed at `akshayprabhakant.com/_site/*` (composed pages load `/_site/<build>/` through `ASSET_BASE`) and the exact `akshayprabhakant.com/`, where it composes the GitHub Pages homepage and fails open to Pages. Earlier: added site-shell (`shell/`, `scripts/build-shell.ts`), the theme-only composition Worker. The package's exports are unchanged (`dist/` gains `apps.js`, which is not exported), so no tag is needed.
- **0.2.0**: removed the Slate Light (`slate-light`) and Slate Dark (`slate-dark`) themes. The catalogue is now Classic Light and Classic Dark, with System as the default. A stored slate id falls back to System (Classic Light or Classic Dark through `prefers-color-scheme`). Every export and token name is unchanged, so an app bumps with no code change.
- **0.1.0**: first release, with Classic Light, Classic Dark, Slate Light and Slate Dark.

## Development

```sh
npm ci
npm test                 # build (tsc + generate dist/) and run unit tests (node:test, jsdom)
npm run check:contrast   # the contrast gate
```

Layout: `src/themes.ts` holds the catalogue, `src/apps.ts` the app list, `src/css.ts` generates the CSS, `src/contrast.ts` holds the gate, `src/boot.ts` the head script, `src/picker.ts` the custom element and `src/react.ts` the wrapper. `scripts/` writes the non-TS outputs into `dist/` and site-shell's build into `shell/generated/` and `shell/public/`. `shell/` holds the site-shell Worker (`worker.ts`, `compose.ts`, `nav.ts` for the slot markup, `client/site.ts`, `wrangler.jsonc`) and its harness (`test-harness/`). `test/compose.test.ts` runs compose() in workerd through Miniflare; `test/nav.test.ts` checks the slot markup with jsdom.

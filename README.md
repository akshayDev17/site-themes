# site-themes

Build-time shared themes for the akshayprabhakant.com apps (homepage, chat archive, quiz, graph notes, election atlas).

**Build time only.** This package serves nothing and runs no service: no Worker, no route, no CDN. Each app installs a pinned git tag and bundles the themes into its own build, so nothing is fetched when a page loads. Theming therefore does not depend on the network, and an app never depends at runtime on another app or on the homepage.

## What it exports

| Import | What it is |
|---|---|
| `site-themes/themes.css` | Generated CSS: Classic Light on `:root`, then one `[data-theme="<id>"]` block per theme, each setting `color-scheme`. A page with no `data-theme` whose OS prefers dark gets Classic Dark. |
| `site-themes` (or `site-themes/themes`) | The catalogue: `THEMES`, `THEME_IDS`, `SYSTEM_THEMES`, `themeCatalogue()`, plus the TypeScript types. |
| `bootScript` from `site-themes` (or `site-themes/boot`) | The inline head script as a string. It sets `<html data-theme>` before first paint. |
| `site-themes/site-theme-boot.js` | The same script as a plain file, for a classic blocking `<script src>`. |
| `defineThemePicker()` from `site-themes` (or `site-themes/picker`) | Registers the `<site-theme-picker>` custom element. It has no framework dependency. |
| `ThemePicker` from `site-themes/react` | A thin React wrapper around the element (`'use client'`). |
| `setThemeChoice()`, `readThemeChoice()` | For an app that wants its own toggle UI instead of the picker. |
| `site-themes/catalogue.json` | `[{ id, label, scheme, swatches }]` for non-JS tooling. |

## Themes

| id | Label | Scheme | Source |
|---|---|---|---|
| `classic-light` | Classic Light | light | Today's shared palette (home, quiz, chat archive, atlas) |
| `classic-dark` | Classic Dark | dark | Classic inverted. The Classic ink becomes the surface. |
| `slate-light` | Slate Light | light | graph-notes' light palette |
| `slate-dark` | Slate Dark | dark | graph-notes' dark palette |

graph-notes has only two surfaces (`bg` and `card`). Slate Light's `surface2` therefore reuses the card white: any tint darker than `bg` would push graph-notes' muted text below 4.5:1.

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
- An unknown stored id falls back to System, for example a theme removed in a later release or a typo. So do a missing key and storage that is missing or throws.
- Open tabs follow a change through the `storage` event. Pickers on the same page stay in sync through a `site-theme-change` window event.
- `data-theme` always holds the resolved theme id. In System mode that is `classic-light` or `classic-dark`, never `system`.

Accepted limits: the Cloudflare Access login pages cannot follow the theme. An installed graph-notes on iOS keeps its own storage. `http://` and `www.` are separate origins, so they keep separate choices.

## Install (pin a git tag)

Install straight from GitHub. the npm registry is not involved, and the package is never published there (`"private": true`).

```sh
npm install github:akshayDev17/site-themes#v0.1.0
```

This writes `"site-themes": "github:akshayDev17/site-themes#v0.1.0"` into the app's `package.json`.

**Built output is committed.** `dist/` (JS, `.d.ts`, `themes.css`, `site-theme-boot.js` and `catalogue.json`) is checked in, and the package has no `prepare` or `install` script. A git install therefore copies ready files with no build step, and no TypeScript runs on the app side. CI fails any PR whose committed `dist/` does not match a fresh build.

## Wiring a Next.js app (static export)

```tsx
// app/layout.tsx
import 'site-themes/themes.css';          // before the app's own CSS
import './globals.css';
import { bootScript } from 'site-themes';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
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

`suppressHydrationWarning` is needed because the boot script sets `data-theme` on `<html>` before React hydrates. The picker draws into its shadow root, so hydration never sees its children.

## Wiring a plain static page (homepage)

Copy `node_modules/site-themes/dist/` into the site's own assets, for example in the site's build step, then:

```html
<head>
  <script src="/assets/site-themes/site-theme-boot.js"></script>   <!-- classic, blocking, first in <head> -->
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

A card's border separates the card from the page it sits on, so `cardLine` is measured against `surface` and `card`. `line` and `lineStrong` are decorative dividers and exempt. Run the gate locally with `npm run check:contrast`. It prints every pair.

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

## Development

```sh
npm ci
npm test                 # build (tsc + generate dist/) and run unit tests (node:test, jsdom)
npm run check:contrast   # the contrast gate
```

Layout: `src/themes.ts` holds the catalogue, `src/css.ts` generates the CSS, `src/contrast.ts` holds the gate, `src/boot.ts` the head script, `src/picker.ts` the custom element and `src/react.ts` the wrapper. `scripts/` writes the non-TS outputs into `dist/`.

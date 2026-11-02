// Writes the non-TypeScript outputs into dist/ from the catalogue:
// themes.css, site-theme-boot.js (plain <script src> include) and catalogue.json.
import { writeFileSync } from 'node:fs';
import { bootScript } from '../src/boot.js';
import { generateCss } from '../src/css.js';
import { THEMES, themeCatalogue } from '../src/themes.js';

const dist = new URL('../../dist/', import.meta.url);
writeFileSync(new URL('themes.css', dist), generateCss(THEMES));
writeFileSync(
  new URL('site-theme-boot.js', dist),
  `/* Generated from src/boot.ts. Load as a classic, blocking <script> in <head>. */\n${bootScript}\n`,
);
writeFileSync(new URL('catalogue.json', dist), JSON.stringify(themeCatalogue(THEMES), null, 2) + '\n');
console.log('wrote dist/themes.css, dist/site-theme-boot.js, dist/catalogue.json');

// Writes the non-TypeScript output into dist/ from the catalogue: themes.css.
import { writeFileSync } from 'node:fs';
import { generateCss } from '../src/css.js';
import { THEMES } from '../src/themes.js';

const dist = new URL('../../dist/', import.meta.url);
writeFileSync(new URL('themes.css', dist), generateCss(THEMES));
console.log('wrote dist/themes.css');

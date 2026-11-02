// The contrast gate: prints every measured pair and exits 1 if any is below its threshold.
import { checkContrast } from '../src/contrast.js';
import { THEMES } from '../src/themes.js';

const results = checkContrast(THEMES);
for (const r of results) {
  const mark = r.pass ? 'ok  ' : 'FAIL';
  console.log(`${mark} ${r.theme.padEnd(14)} ${r.fg.padEnd(10)} on ${r.bg.padEnd(9)} ${r.ratio.toFixed(2).padStart(6)}:1  (min ${r.min}:1)`);
}
const failures = results.filter((r) => !r.pass);
if (failures.length > 0) {
  console.error(`\n${failures.length} pair(s) below threshold.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} pairs across ${THEMES.length} themes pass.`);

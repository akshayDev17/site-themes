// /_site/<build>/site.js: what composed pages run after parsing (deferred).
// Registers <site-theme-picker>, which the apps place themselves, and looks
// after the site row where it scrolls (a portrait phone).
import { defineThemePicker } from '../../src/picker.js';

defineThemePicker();

// The site row (shell/nav.ts) is one line that scrolls sideways where it is
// wider than its box. Two things CSS cannot do:
// - start it scrolled so the current app is in view (unscrolled, the last app,
//   Election Atlas, is the one cut off), centred where it would be cut off;
// - say which edges have apps past them, as data-more="start end", which the
//   row's CSS fades so the row reads as scrollable.
// Apps can redraw the slot after a client-side navigation, so rows are found
// again whenever one is added.
const ROWS = 'site-slot[name="site-path"] .sp-apps';
const seen = new WeakSet<Element>();

function markEdges(row: HTMLElement): void {
  const end = row.scrollWidth - row.clientWidth;
  const more = [row.scrollLeft > 1 ? 'start' : '', row.scrollLeft < end - 1 ? 'end' : ''].filter(Boolean).join(' ');
  if (more) row.dataset.more = more;
  else delete row.dataset.more;
}

function showCurrent(row: HTMLElement): void {
  const current = row.querySelector<HTMLElement>('[aria-current]');
  if (!current || row.scrollWidth <= row.clientWidth) return;
  const box = row.getBoundingClientRect();
  const item = current.getBoundingClientRect();
  const fade = 32;
  if (item.left >= box.left + fade && item.right <= box.right - fade) return;
  const left = item.left - box.left + row.scrollLeft;
  row.scrollLeft = Math.max(0, left - (row.clientWidth - item.width) / 2);
}

/** Marks every row's edges; a row seen for the first time (or every row, with `recentre`) also shows its current app. */
function syncRows(recentre = false): void {
  for (const row of document.querySelectorAll<HTMLElement>(ROWS)) {
    if (!seen.has(row)) {
      seen.add(row);
      showCurrent(row);
      row.addEventListener('scroll', () => markEdges(row), { passive: true });
    } else if (recentre) showCurrent(row);
    markEdges(row);
  }
}

let queued = false;
const queueSync = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    syncRows();
  });
};

syncRows();
window.addEventListener('resize', queueSync);
// The row's width changes once its web font loads.
document.fonts?.ready.then(() => syncRows(true), () => {});
new MutationObserver((records) => {
  const added = records.some((r) =>
    [...r.addedNodes].some((n) => n instanceof Element && (n.matches('site-slot, .sp-apps, .sp') || n.querySelector('.sp-apps'))),
  );
  if (added) queueSync();
}).observe(document.documentElement, { childList: true, subtree: true });

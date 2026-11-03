// /_site/<build>/site.js: what composed pages run after parsing (deferred).
// Registers <site-theme-picker>, which the apps place themselves, opens the
// site path's phone sheet in browsers that cannot do it without JavaScript, and
// holds that sheet to the screen.
import { defineThemePicker } from '../../src/picker.js';

defineThemePicker();

// The site path's sheet is a <dialog> opened and closed by invoker commands
// (<button commandfor command="show-modal|close">) and light-dismissed by
// closedby="any", which need no script. Where a browser has neither, do both here.
if (!('command' in HTMLButtonElement.prototype)) {
  document.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest?.('button[commandfor]');
    const dialog = button && document.getElementById(button.getAttribute('commandfor') ?? '');
    if (!(dialog instanceof HTMLDialogElement)) return;
    const command = button.getAttribute('command');
    if (command === 'show-modal' && !dialog.open) dialog.showModal();
    else if (command === 'close') dialog.close();
  });
}
if (!('closedBy' in HTMLDialogElement.prototype)) {
  // A click on the backdrop targets the dialog itself; its content never does.
  document.addEventListener('click', (event) => {
    const dialog = event.target;
    if (dialog instanceof HTMLDialogElement && dialog.open && dialog.getAttribute('closedby') === 'any') {
      const r = dialog.getBoundingClientRect();
      const e = event as MouseEvent;
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    }
  });
}

// The sheet's own CSS fits it to the screen while the page is not panned. A page
// wider than a phone's screen can be panned (and any page zoomed), which moves
// the screen, the visual viewport, within the layout viewport the fixed sheet is
// placed in; so hold each sheet to the visual viewport: its left edge and width,
// its bottom on the screen's bottom, and at most 85% of the screen's height.
function holdSheetsToScreen(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  for (const sheet of document.querySelectorAll<HTMLDialogElement>('dialog.sp-sheet')) {
    const s = sheet.style;
    s.left = `${vv.offsetLeft}px`;
    s.width = `${vv.width}px`;
    s.top = `${vv.offsetTop + vv.height}px`;
    s.bottom = 'auto';
    s.transform = 'translateY(-100%)';
    s.maxHeight = `${vv.height * 0.85}px`;
  }
}
let holdQueued = false;
const queueHold = () => {
  if (holdQueued) return;
  holdQueued = true;
  requestAnimationFrame(() => {
    holdQueued = false;
    holdSheetsToScreen();
  });
};
holdSheetsToScreen();
window.visualViewport?.addEventListener('resize', queueHold);
window.visualViewport?.addEventListener('scroll', queueHold);

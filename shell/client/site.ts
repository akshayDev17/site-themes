// /_site/<build>/site.js: what composed pages run after parsing (deferred).
// Registers <site-theme-picker>, which the apps place themselves, and opens the
// site path's phone sheet in browsers that cannot do it without JavaScript.
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

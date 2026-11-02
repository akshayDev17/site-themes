// <site-theme-picker>: a framework-free custom element listing System plus
// every catalogue theme. Nothing here touches the DOM at import time, so the
// module is safe to import from server-rendered code.
import { BOOT_CONFIG, CHANGE_EVENT, STORAGE_KEY, SYSTEM_CHOICE, siteThemeBoot } from './boot.js';
import { THEMES, THEME_IDS } from './themes.js';
export const PICKER_TAG = 'site-theme-picker';
/** The stored choice: a known theme id, or 'system' (missing, unknown, or storage unavailable). */
export function readThemeChoice(w = window) {
    let value = null;
    try {
        value = w.localStorage.getItem(STORAGE_KEY);
    }
    catch {
        value = null;
    }
    return value !== null && THEME_IDS.includes(value) ? value : SYSTEM_CHOICE;
}
/**
 * Stores a choice ('system' or a theme id; anything else means 'system') and
 * applies it to this page. Other open tabs follow through the storage event.
 */
export function setThemeChoice(choice, w = window) {
    const value = THEME_IDS.includes(choice) ? choice : SYSTEM_CHOICE;
    try {
        w.localStorage.setItem(STORAGE_KEY, value);
    }
    catch {
        // Storage blocked: the choice still applies to this page.
    }
    siteThemeBoot(w, BOOT_CONFIG); // no-op when the head script already ran
    w.dispatchEvent(new w.CustomEvent(CHANGE_EVENT, { detail: value }));
    return value;
}
const STYLE = `
:host { display: inline-block; }
label { display: inline-flex; align-items: center; gap: .5em; }
select {
  font: inherit; color: var(--text, #0F1220); background: var(--card, #FFFFFF);
  border: 1px solid var(--card-line, #818A9F); border-radius: 4px;
  min-height: 24px; padding: 2px 6px; cursor: pointer;
}
select:focus-visible { outline: 2px solid var(--focus, #0F1220); outline-offset: 2px; }
.visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
}`;
/**
 * Registers <site-theme-picker> on `w` (once). Attributes:
 * - `label`: visible label text (default "Theme");
 * - `hide-label`: keep the label for screen readers only.
 * Shadow parts `label` and `select` can be styled with ::part().
 */
export function defineThemePicker(w = window) {
    if (w.customElements.get(PICKER_TAG))
        return;
    class SiteThemePicker extends w.HTMLElement {
        static observedAttributes = ['label', 'hide-label'];
        #select;
        #text;
        #onStorage = (e) => {
            if (e.key === STORAGE_KEY || e.key === null)
                this.#select.value = readThemeChoice(w);
        };
        #onChange = (e) => {
            const detail = e.detail;
            if (typeof detail === 'string')
                this.#select.value = detail;
        };
        constructor() {
            super();
            const doc = w.document;
            const root = this.attachShadow({ mode: 'open' });
            const style = doc.createElement('style');
            style.textContent = STYLE;
            const label = doc.createElement('label');
            label.setAttribute('part', 'label');
            this.#text = doc.createElement('span');
            this.#select = doc.createElement('select');
            this.#select.setAttribute('part', 'select');
            const options = [[SYSTEM_CHOICE, 'System'], ...THEMES.map((t) => [t.id, t.label])];
            for (const [value, text] of options) {
                const option = doc.createElement('option');
                option.value = value;
                option.textContent = text;
                this.#select.append(option);
            }
            this.#select.addEventListener('change', () => setThemeChoice(this.#select.value, w));
            label.append(this.#text, this.#select);
            root.append(style, label);
            this.#renderLabel();
        }
        connectedCallback() {
            siteThemeBoot(w, BOOT_CONFIG);
            this.#select.value = readThemeChoice(w);
            w.addEventListener('storage', this.#onStorage);
            w.addEventListener(CHANGE_EVENT, this.#onChange);
        }
        disconnectedCallback() {
            w.removeEventListener('storage', this.#onStorage);
            w.removeEventListener(CHANGE_EVENT, this.#onChange);
        }
        attributeChangedCallback() {
            this.#renderLabel();
        }
        #renderLabel() {
            this.#text.textContent = this.getAttribute('label') ?? 'Theme';
            this.#text.className = this.hasAttribute('hide-label') ? 'visually-hidden' : '';
        }
    }
    w.customElements.define(PICKER_TAG, SiteThemePicker);
}

// <site-theme-picker>: a framework-free custom element listing System plus
// every catalogue theme. Nothing here touches the DOM at import time, so the
// module is safe to import from server-rendered code.
import { BOOT_CONFIG, CHANGE_EVENT, STORAGE_KEY, SYSTEM_CHOICE, siteThemeBoot, type BootWindow } from './boot.js';
import { THEMES, THEME_IDS } from './themes.js';

export const PICKER_TAG = 'site-theme-picker';

/** A window object, including another realm's (tests pass a jsdom window). */
type Win = Window & typeof globalThis;

/** The stored choice: a known theme id, or 'system' (missing, unknown, or storage unavailable). */
export function readThemeChoice(w: Win = window): string {
  let value: string | null = null;
  try {
    value = w.localStorage.getItem(STORAGE_KEY);
  } catch {
    value = null;
  }
  return value !== null && THEME_IDS.includes(value) ? value : SYSTEM_CHOICE;
}

/**
 * Stores a choice ('system' or a theme id; anything else means 'system') and
 * applies it to this page. Other open tabs follow through the storage event.
 */
export function setThemeChoice(choice: string, w: Win = window): string {
  const value = THEME_IDS.includes(choice) ? choice : SYSTEM_CHOICE;
  try {
    w.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage blocked: the choice still applies to this page.
  }
  siteThemeBoot(w as unknown as BootWindow, BOOT_CONFIG); // no-op when the head script already ran
  w.dispatchEvent(new w.CustomEvent(CHANGE_EVENT, { detail: value }));
  return value;
}

// The control and its open list are drawn from the same tokens, font, radius and
// border, so the list reads as the control unfolded in every theme. The
// chevron sits 11px in from the right edge, vertically centred, and the value
// keeps 8px clear of it. The option under the pointer or keyboard gets a wash
// of --text in --card plus a 2px --focus ring (3:1 on --card in every theme,
// the contrast gate's focus rule); the chosen option carries a check mark.
const STYLE = `
:host { display: inline-flex; align-items: center; gap: .5em; vertical-align: middle; }
.trigger {
  display: inline-flex; align-items: center; justify-content: space-between; gap: 8px;
  box-sizing: border-box; min-height: 24px; padding: 2px 11px 2px 8px;
  font: inherit; color: var(--text, #0F1220); background: var(--card, #FFFFFF);
  border: 1px solid var(--card-line, #818A9F); border-radius: 4px;
  cursor: pointer; user-select: none; -webkit-user-select: none; white-space: nowrap;
}
.value { display: grid; }
.value > span { grid-area: 1 / 1; }
.sizer { visibility: hidden; }
.trigger:focus-visible { outline: 2px solid var(--focus, #0F1220); outline-offset: 2px; }
.chevron { flex: none; width: .75em; min-width: 8px; height: auto; aspect-ratio: 10 / 6; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.list {
  position: fixed; inset: auto; margin: 0; box-sizing: border-box; overflow: auto;
  padding: 3px; color: var(--text, #0F1220); background: var(--card, #FFFFFF);
  border: 1px solid var(--card-line, #818A9F); border-radius: 4px;
  box-shadow: var(--shadow-hover, 0 8px 24px rgb(0 0 0 / .2)); z-index: 2147483000;
}
.list[hidden] { display: none; }
.option {
  display: flex; align-items: center; gap: 8px; box-sizing: border-box;
  min-height: 24px; padding: 2px 11px 2px 8px; border-radius: 3px;
  cursor: pointer; white-space: nowrap;
}
.check { flex: none; width: .75em; min-width: 8px; height: auto; aspect-ratio: 1; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; visibility: hidden; }
.option[aria-selected="true"] .check { visibility: visible; }
.option.active {
  background: color-mix(in srgb, var(--text, #0F1220) 10%, var(--card, #FFFFFF));
  box-shadow: inset 0 0 0 2px var(--focus, #0F1220);
}
.visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
}`;

const SVG_NS = 'http://www.w3.org/2000/svg';
const CHEVRON = 'M1 1l4 4 4-4';
const CHECK = 'M2 6.5l2.5 2.5L10 3';
// Copied from the control onto the open list when it opens, so an app that
// restyles the control through ::part(select) gets a list in the same type.
const SHARED_TYPE = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'textTransform', 'lineHeight', 'borderRadius'] as const;
const TYPEAHEAD_MS = 500;

function icon(doc: Document, cls: string, viewBox: string, d: string): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

/**
 * Registers <site-theme-picker> on `w` (once): a select-only combobox (WAI-ARIA
 * APG) listing System plus every catalogue theme. Attributes:
 * - `label`: visible label text (default "Theme");
 * - `hide-label`: keep the label for screen readers only.
 * Shadow parts `label`, `select` (the control), `listbox` and `option` can be
 * styled with ::part().
 */
export function defineThemePicker(w: Win = window): void {
  if (w.customElements.get(PICKER_TAG)) return;

  const options: [string, string][] = [[SYSTEM_CHOICE, 'System'], ...THEMES.map((t): [string, string] => [t.id, t.label])];

  class SiteThemePicker extends w.HTMLElement {
    static observedAttributes = ['label', 'hide-label'];
    #label: HTMLSpanElement;
    #trigger: HTMLDivElement;
    #valueText: HTMLSpanElement;
    #list: HTMLDivElement;
    #options: HTMLDivElement[];
    #popover: boolean;
    #value = SYSTEM_CHOICE;
    #active = 0;
    #typed = '';
    #typedAt = 0;
    #onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) this.#show(readThemeChoice(w));
    };
    #onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === 'string') this.#show(detail);
    };
    #onOutside = (e: Event) => {
      if (!e.composedPath().includes(this)) this.#close();
    };
    #onViewport = () => this.#place();

    constructor() {
      super();
      const doc = w.document;
      const root = this.attachShadow({ mode: 'open' });
      const style = doc.createElement('style');
      style.textContent = STYLE;

      this.#label = doc.createElement('span');
      this.#label.id = 'label';
      this.#label.setAttribute('part', 'label');

      this.#trigger = doc.createElement('div');
      this.#trigger.className = 'trigger';
      this.#trigger.setAttribute('part', 'select');
      this.#trigger.setAttribute('role', 'combobox');
      this.#trigger.setAttribute('tabindex', '0');
      this.#trigger.setAttribute('aria-haspopup', 'listbox');
      this.#trigger.setAttribute('aria-expanded', 'false');
      this.#trigger.setAttribute('aria-controls', 'listbox');
      this.#trigger.setAttribute('aria-labelledby', 'label');
      this.#valueText = doc.createElement('span');
      this.#valueText.className = 'current';
      const value = doc.createElement('span');
      value.className = 'value';
      value.append(
        this.#valueText,
        ...options.map(([, text]) => {
          const sizer = doc.createElement('span');
          sizer.className = 'sizer';
          sizer.textContent = text;
          return sizer;
        }),
      );
      this.#trigger.append(value, icon(doc, 'chevron', '0 0 10 6', CHEVRON));

      this.#list = doc.createElement('div');
      this.#list.id = 'listbox';
      this.#list.className = 'list';
      this.#list.setAttribute('part', 'listbox');
      this.#list.setAttribute('role', 'listbox');
      this.#list.setAttribute('aria-labelledby', 'label');
      this.#list.setAttribute('tabindex', '-1');
      this.#options = options.map(([value, text]) => {
        const option = doc.createElement('div');
        option.id = `option-${value}`;
        option.className = 'option';
        option.dataset.value = value;
        option.setAttribute('part', 'option');
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        const label = doc.createElement('span');
        label.textContent = text;
        option.append(icon(doc, 'check', '0 0 12 12', CHECK), label);
        return option;
      });
      this.#list.append(...this.#options);
      this.#popover = typeof (this.#list as { showPopover?: unknown }).showPopover === 'function';
      if (this.#popover) this.#list.setAttribute('popover', 'manual');
      else this.#list.hidden = true;

      this.#label.addEventListener('click', () => this.#trigger.focus());
      this.#trigger.addEventListener('click', () => (this.#isOpen() ? this.#close() : this.#open(this.#selectedIndex())));
      this.#trigger.addEventListener('keydown', (e) => this.#onKey(e));
      this.#trigger.addEventListener('blur', () => this.#close());
      // Keep focus on the control while the pointer is on the list.
      this.#list.addEventListener('pointerdown', (e) => e.preventDefault());
      this.#list.addEventListener('mousedown', (e) => e.preventDefault());
      this.#list.addEventListener('pointermove', (e) => {
        const option = (e.target as Element).closest?.('.option');
        if (option) this.#setActive(this.#options.indexOf(option as HTMLDivElement));
      });
      this.#list.addEventListener('click', (e) => {
        const option = (e.target as Element).closest?.('.option');
        if (option) this.#choose(this.#options.indexOf(option as HTMLDivElement));
      });

      root.append(style, this.#label, this.#trigger, this.#list);
      this.#renderLabel();
      this.#show(SYSTEM_CHOICE);
    }

    connectedCallback() {
      siteThemeBoot(w as unknown as BootWindow, BOOT_CONFIG);
      this.#show(readThemeChoice(w));
      w.addEventListener('storage', this.#onStorage);
      w.addEventListener(CHANGE_EVENT, this.#onChange);
    }

    disconnectedCallback() {
      this.#close();
      w.removeEventListener('storage', this.#onStorage);
      w.removeEventListener(CHANGE_EVENT, this.#onChange);
    }

    attributeChangedCallback() {
      this.#renderLabel();
    }

    #renderLabel() {
      this.#label.textContent = this.getAttribute('label') ?? 'Theme';
      this.#label.className = this.hasAttribute('hide-label') ? 'visually-hidden' : '';
    }

    /** Shows `value` as the current choice (nothing is stored). */
    #show(value: string) {
      const index = Math.max(0, options.findIndex(([v]) => v === value));
      this.#value = options[index][0];
      this.#valueText.textContent = options[index][1];
      this.#options.forEach((o, i) => o.setAttribute('aria-selected', String(i === index)));
    }

    #selectedIndex() {
      return Math.max(0, options.findIndex(([v]) => v === this.#value));
    }

    #isOpen() {
      return this.#trigger.getAttribute('aria-expanded') === 'true';
    }

    #open(active: number) {
      if (!this.#isOpen()) {
        const type = w.getComputedStyle(this.#trigger);
        for (const prop of SHARED_TYPE) this.#list.style[prop] = type[prop];
        this.#trigger.setAttribute('aria-expanded', 'true');
        if (this.#popover) (this.#list as unknown as { showPopover(): void }).showPopover();
        else this.#list.hidden = false;
        this.#place();
        w.document.addEventListener('pointerdown', this.#onOutside, true);
        w.addEventListener('resize', this.#onViewport);
        w.addEventListener('scroll', this.#onViewport, true);
      }
      this.#setActive(active);
    }

    #close() {
      if (!this.#isOpen()) return;
      this.#trigger.setAttribute('aria-expanded', 'false');
      this.#trigger.removeAttribute('aria-activedescendant');
      this.#typed = '';
      if (this.#popover) (this.#list as unknown as { hidePopover(): void }).hidePopover();
      else this.#list.hidden = true;
      this.#options.forEach((o) => o.classList.remove('active'));
      w.document.removeEventListener('pointerdown', this.#onOutside, true);
      w.removeEventListener('resize', this.#onViewport);
      w.removeEventListener('scroll', this.#onViewport, true);
    }

    /** Puts the list under the control (above it when there is no room below), inside the window. */
    #place() {
      if (!this.#isOpen()) return;
      const r = this.#trigger.getBoundingClientRect();
      const list = this.#list;
      list.style.minWidth = `${r.width}px`;
      const h = list.offsetHeight;
      const wd = list.offsetWidth;
      const below = r.bottom + 4;
      const top = below + h <= w.innerHeight || r.top - 4 - h < 0 ? below : r.top - 4 - h;
      list.style.top = `${Math.round(top)}px`;
      list.style.left = `${Math.round(Math.max(4, Math.min(r.left, w.innerWidth - wd - 4)))}px`;
    }

    #setActive(index: number) {
      this.#active = Math.min(options.length - 1, Math.max(0, index));
      this.#options.forEach((o, i) => o.classList.toggle('active', i === this.#active));
      this.#trigger.setAttribute('aria-activedescendant', this.#options[this.#active].id);
    }

    #choose(index: number) {
      this.#close();
      const value = options[index][0];
      this.#show(value);
      setThemeChoice(value, w);
    }

    /** Type-ahead: the next option whose label starts with what was typed. */
    #match(key: string): number {
      const now = Date.now();
      this.#typed = now - this.#typedAt > TYPEAHEAD_MS ? key : this.#typed + key;
      this.#typedAt = now;
      const typed = this.#typed.toLowerCase();
      const repeated = [...typed].every((c) => c === typed[0]);
      const search = repeated ? typed[0] : typed;
      const from = this.#isOpen() ? this.#active : this.#selectedIndex();
      for (let step = repeated ? 1 : 0; step <= options.length; step++) {
        const i = (from + step) % options.length;
        if (options[i][1].toLowerCase().startsWith(search)) return i;
      }
      return -1;
    }

    #onKey(e: KeyboardEvent) {
      const open = this.#isOpen();
      const last = options.length - 1;
      const typing = Date.now() - this.#typedAt <= TYPEAHEAD_MS && this.#typed !== '';
      let handled = true;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key !== ' ' || typing)) {
        const i = this.#match(e.key);
        this.#open(i >= 0 ? i : open ? this.#active : this.#selectedIndex());
      } else if (!open) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') this.#open(this.#selectedIndex());
        else if (e.key === 'Home') this.#open(0);
        else if (e.key === 'End') this.#open(last);
        else handled = false;
      } else if (e.key === 'ArrowUp' && e.altKey) this.#choose(this.#active);
      else if (e.key === 'ArrowDown') this.#setActive(this.#active + 1);
      else if (e.key === 'ArrowUp') this.#setActive(this.#active - 1);
      else if (e.key === 'Home' || e.key === 'PageUp') this.#setActive(0);
      else if (e.key === 'End' || e.key === 'PageDown') this.#setActive(last);
      else if (e.key === 'Enter' || e.key === ' ') this.#choose(this.#active);
      else if (e.key === 'Escape') this.#close();
      else if (e.key === 'Tab') {
        this.#choose(this.#active);
        handled = false; // focus moves on as usual
      } else handled = false;
      if (handled) e.preventDefault();
    }
  }

  w.customElements.define(PICKER_TAG, SiteThemePicker);
}

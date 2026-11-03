export declare const PICKER_TAG = "site-theme-picker";
/** A window object, including another realm's (tests pass a jsdom window). */
type Win = Window & typeof globalThis;
/** The stored choice: a known theme id, or 'system' (missing, unknown, or storage unavailable). */
export declare function readThemeChoice(w?: Win): string;
/**
 * Stores a choice ('system' or a theme id; anything else means 'system') and
 * applies it to this page. Other open tabs follow through the storage event.
 */
export declare function setThemeChoice(choice: string, w?: Win): string;
/**
 * Registers <site-theme-picker> on `w` (once): a select-only combobox (WAI-ARIA
 * APG) listing System plus every catalogue theme. Attributes:
 * - `label`: visible label text (default "Theme");
 * - `hide-label`: keep the label for screen readers only.
 * Shadow parts `label`, `select` (the control), `listbox` and `option` can be
 * styled with ::part().
 *
 * The shadow root also keeps a hidden, inert native <select> inside a <label>,
 * in sync with the choice: it is not shown, focused or announced, and is there
 * for scripts and tests that read or set the choice through `select.value`.
 */
export declare function defineThemePicker(w?: Win): void;
export {};

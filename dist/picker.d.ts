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
 * Registers <site-theme-picker> on `w` (once). Attributes:
 * - `label`: visible label text (default "Theme");
 * - `hide-label`: keep the label for screen readers only.
 * Shadow parts `label` and `select` can be styled with ::part().
 */
export declare function defineThemePicker(w?: Win): void;
export {};

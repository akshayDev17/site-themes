/** The one localStorage key every app on the origin shares. */
export declare const STORAGE_KEY = "site-theme";
/** Stored value meaning "follow the OS"; also what a missing or unknown value means. */
export declare const SYSTEM_CHOICE = "system";
/** Same-page event a picker dispatches on window after changing the choice. detail = the choice. */
export declare const CHANGE_EVENT = "site-theme-change";
export interface BootConfig {
    key: string;
    event: string;
    ids: readonly string[];
    light: string;
    dark: string;
}
export declare const BOOT_CONFIG: BootConfig;
interface MediaQueryLike {
    matches: boolean;
    addEventListener?: (type: 'change', fn: () => void) => void;
    addListener?: (fn: () => void) => void;
}
export interface BootWindow {
    document: {
        documentElement: {
            setAttribute(name: string, value: string): void;
        };
    };
    localStorage?: {
        getItem(key: string): string | null;
    };
    matchMedia?: (query: string) => MediaQueryLike;
    addEventListener(type: string, fn: (e: {
        key?: string | null;
        detail?: unknown;
    }) => void): void;
    __siteThemeBoot?: boolean;
}
/**
 * Self-contained on purpose: `bootScript` is this function's source text, so it
 * must not reference anything outside its parameters, and it stays ES5 so no
 * bundler rewrites it. Idempotent per window.
 */
export declare function siteThemeBoot(w: BootWindow, c: BootConfig): void;
/** Builds the inline script for a catalogue/config. */
export declare function buildBootScript(config?: BootConfig): string;
/**
 * Inline this in <head>, before any stylesheet that uses the tokens:
 * Next.js: <script dangerouslySetInnerHTML={{ __html: bootScript }} /> with
 * suppressHydrationWarning on <html>.
 */
export declare const bootScript: string;
export {};

// The head boot script: sets <html data-theme> before first paint and keeps it
// in sync with other tabs (storage event), the OS (System mode) and pickers on
// the same page (CHANGE_EVENT).
import { SYSTEM_THEMES, THEME_IDS } from './themes.js';
/** The one localStorage key every app on the origin shares. */
export const STORAGE_KEY = 'site-theme';
/** Stored value meaning "follow the OS"; also what a missing or unknown value means. */
export const SYSTEM_CHOICE = 'system';
/** Same-page event a picker dispatches on window after changing the choice. detail = the choice. */
export const CHANGE_EVENT = 'site-theme-change';
export const BOOT_CONFIG = {
    key: STORAGE_KEY,
    event: CHANGE_EVENT,
    ids: THEME_IDS,
    light: SYSTEM_THEMES.light,
    dark: SYSTEM_THEMES.dark,
};
/**
 * Self-contained on purpose: `bootScript` is this function's source text, so it
 * must not reference anything outside its parameters, and it stays ES5 so no
 * bundler rewrites it. Idempotent per window.
 */
export function siteThemeBoot(w, c) {
    if (w.__siteThemeBoot)
        return;
    w.__siteThemeBoot = true;
    var root = w.document.documentElement;
    var mq = null;
    try {
        mq = w.matchMedia ? w.matchMedia('(prefers-color-scheme: dark)') : null;
    }
    catch (e) {
        mq = null;
    }
    // Last choice made on this page; used only when storage is missing or throws.
    var last = null;
    function stored() {
        try {
            return w.localStorage ? w.localStorage.getItem(c.key) : last;
        }
        catch (e) {
            return last;
        }
    }
    function apply(choice) {
        if (typeof choice === 'string')
            last = choice;
        var v = typeof choice === 'string' ? choice : stored();
        var known = false;
        for (var i = 0; i < c.ids.length; i++)
            if (c.ids[i] === v)
                known = true;
        root.setAttribute('data-theme', known ? v : mq && mq.matches ? c.dark : c.light);
    }
    apply();
    w.addEventListener('storage', function (e) {
        if (e.key === c.key || e.key === null)
            apply();
    });
    w.addEventListener(c.event, function (e) {
        apply(e.detail);
    });
    if (mq) {
        if (mq.addEventListener)
            mq.addEventListener('change', function () { apply(); });
        else if (mq.addListener)
            mq.addListener(function () { apply(); });
    }
}
/** Builds the inline script for a catalogue/config. */
export function buildBootScript(config = BOOT_CONFIG) {
    return `(${siteThemeBoot.toString()})(window,${JSON.stringify(config)});`;
}
/**
 * Inline this in <head>, before any stylesheet that uses the tokens:
 * Next.js: <script dangerouslySetInnerHTML={{ __html: bootScript }} /> with
 * suppressHydrationWarning on <html>.
 */
export const bootScript = buildBootScript();

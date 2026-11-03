export interface App {
    /** What the app's Worker passes as compose({ app }). */
    id: string;
    /** The name the switcher and the homepage list show, in sentence case. */
    label: string;
    /** The app's root on akshayprabhakant.com: a path starting with '/'. */
    path: string;
    /** One line under the name in the phone sheet and the homepage list. */
    blurb: string;
    /** Behind Cloudflare Access: shown with a lock and "(invite-only, sign-in required)". */
    gated: boolean;
    /** false = unlisted (see the top of this file). */
    listed: boolean;
}
/** The homepage's id: the first entry, the site itself. */
export declare const HOME_ID = "home";
export declare const APPS: readonly App[];
/** The same pattern compose() applies to its `app` option. */
export declare const APP_ID: RegExp;
/** Throws on a list site-shell cannot render correctly. */
export declare function validateApps(apps: readonly App[]): void;

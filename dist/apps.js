// The app list: the one place every app on akshayprabhakant.com is listed.
// site-shell builds the site path switcher (<site-slot name="site-path">) and
// the homepage Apps list (<site-slot name="site-apps">) from this file, so
// adding, renaming, locking or hiding an app is one entry here and one merged
// PR. Order here is the order everywhere.
//
// Hiding an app (listed: false) unlists it: it leaves every other app's
// switcher and the homepage list, its own pages are marked noindex and their
// switcher says "Not listed", and its direct links keep working. Making an app
// private is a separate step: put it behind Cloudflare Access (gated: true is
// only the lock shown next to its name).
/** The homepage's id: the first entry, the site itself. */
export const HOME_ID = 'home';
export const APPS = [
    { id: HOME_ID, label: 'Portfolio', path: '/', blurb: 'Work, research and contact', gated: false, listed: true },
    { id: 'chat', label: 'AI Digest', path: '/chat-archives', blurb: 'AI chat sessions filed as a newspaper', gated: false, listed: true },
    { id: 'quiz', label: 'Quiz Room', path: '/quiz', blurb: 'Timed multiple-choice quizzes', gated: true, listed: true },
    { id: 'graph', label: 'Graph Notes', path: '/graph/', blurb: 'Personal notes as a linked graph', gated: true, listed: true },
    { id: 'atlas', label: 'Election Atlas', path: '/elections/india/', blurb: 'Every Lok Sabha and assembly result', gated: false, listed: true },
];
/** The same pattern compose() applies to its `app` option. */
export const APP_ID = /^[a-z0-9-]{1,32}$/;
/** Throws on a list site-shell cannot render correctly. */
export function validateApps(apps) {
    const ids = new Set();
    for (const app of apps) {
        if (!APP_ID.test(app.id))
            throw new Error(`app id must match ${APP_ID}: ${app.id}`);
        if (ids.has(app.id))
            throw new Error(`duplicate app id: ${app.id}`);
        ids.add(app.id);
        if (!/^\/(?!\/)/.test(app.path))
            throw new Error(`${app.id}: path must start with a single '/': ${app.path}`);
        if (!app.label.trim())
            throw new Error(`${app.id}: empty label`);
    }
    const home = apps[0];
    if (home?.id !== HOME_ID || home.path !== '/')
        throw new Error(`the first app must be '${HOME_ID}' at '/'`);
    if (!home.listed)
        throw new Error(`'${HOME_ID}' cannot be unlisted`);
}

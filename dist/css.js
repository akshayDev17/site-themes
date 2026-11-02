// Turns the catalogue into themes.css.
import { BASE_THEME_ID, SYSTEM_THEMES, VETTED_FONTS } from './themes.js';
/** 'textMuted' -> 'text-muted', 'surface2' -> 'surface-2'. */
function kebab(name) {
    return name.replace(/([A-Z])/g, '-$1').replace(/(\d+)/g, '-$1').toLowerCase();
}
/** Throws on anything that could break out of a declaration or a selector. */
export function validateTheme(theme) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(theme.id))
        throw new Error(`bad theme id: ${theme.id}`);
    for (const [name, value] of themeDeclarations(theme)) {
        if (/[{};<>]|\/\*/.test(value))
            throw new Error(`${theme.id}: unsafe value for ${name}: ${value}`);
    }
    if (theme.font && !VETTED_FONTS.some((f) => f.serif === theme.font.serif && f.mono === theme.font.mono)) {
        throw new Error(`${theme.id}: font pair is not in VETTED_FONTS`);
    }
}
/** The custom properties one theme sets, in a stable order. */
export function themeDeclarations(theme) {
    const decls = Object.entries(theme.color).map(([k, v]) => [`--${kebab(k)}`, v]);
    if (theme.shadow)
        decls.push(['--shadow-rest', theme.shadow.rest], ['--shadow-hover', theme.shadow.hover]);
    if (theme.radius)
        decls.push(['--radius-card', theme.radius.card]);
    if (theme.font)
        decls.push(['--font-serif', theme.font.serif], ['--font-mono', theme.font.mono]);
    return decls;
}
function block(selector, theme, indent = '') {
    const body = [`color-scheme: ${theme.scheme};`, ...themeDeclarations(theme).map(([k, v]) => `${k}: ${v};`)];
    return `${indent}${selector} {\n${body.map((l) => `${indent}  ${l}`).join('\n')}\n${indent}}`;
}
function byId(themes, id) {
    const theme = themes.find((t) => t.id === id);
    if (!theme)
        throw new Error(`theme not in catalogue: ${id}`);
    return theme;
}
/**
 * One `[data-theme="<id>"]` block per theme. The base theme also sits on
 * `:root`, and the System dark theme applies when no `data-theme` is set and
 * the OS prefers dark (covers pages whose boot script did not run).
 */
export function generateCss(themes) {
    const ids = new Set();
    for (const t of themes) {
        validateTheme(t);
        if (ids.has(t.id))
            throw new Error(`duplicate theme id: ${t.id}`);
        ids.add(t.id);
    }
    const base = byId(themes, BASE_THEME_ID);
    if (!base.shadow || !base.radius || !base.font) {
        throw new Error(`${BASE_THEME_ID} must define shadow, radius and font: other themes inherit them`);
    }
    const systemDark = byId(themes, SYSTEM_THEMES.dark);
    byId(themes, SYSTEM_THEMES.light);
    const parts = [
        '/* Generated from src/themes.ts by scripts/generate.ts. Do not edit by hand. */',
        block(':root', base),
        `@media (prefers-color-scheme: dark) {\n${block(':root:not([data-theme])', systemDark, '  ')}\n}`,
        ...themes.map((t) => block(`[data-theme="${t.id}"]`, t)),
    ];
    return parts.join('\n\n') + '\n';
}

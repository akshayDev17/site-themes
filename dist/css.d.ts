import { type Theme } from './themes.js';
/** Throws on anything that could break out of a declaration or a selector. */
export declare function validateTheme(theme: Theme): void;
/** The custom properties one theme sets, in a stable order. */
export declare function themeDeclarations(theme: Theme): [string, string][];
/** One `[data-theme="<id>"]` block per theme. The base theme also sits on `:root`. */
export declare function generateCss(themes: readonly Theme[]): string;

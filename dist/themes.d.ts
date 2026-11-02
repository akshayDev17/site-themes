export type Scheme = 'light' | 'dark';
export interface ThemeColors {
    surface: string;
    surface2: string;
    card: string;
    text: string;
    textBody: string;
    textMuted: string;
    line: string;
    lineStrong: string;
    cardLine: string;
    cardLineHover: string;
    accent: string;
    focus: string;
    danger: string;
    warn: string;
    ok: string;
}
export interface ThemeFonts {
    serif: string;
    mono: string;
}
export interface Theme {
    /** Stored value and `data-theme` attribute value, e.g. 'classic-light'. */
    id: string;
    /** What the picker shows. */
    label: string;
    /** Sets CSS `color-scheme`. */
    scheme: Scheme;
    color: ThemeColors;
    /** Elevation. Omitted -> inherits the base theme's value from `:root`. */
    shadow?: {
        rest: string;
        hover: string;
    };
    /** Shape. Omitted -> inherits the base theme's value from `:root`. */
    radius?: {
        card: string;
    };
    /** Must be one of VETTED_FONTS. Omitted -> inherits the base theme's fonts. */
    font?: ThemeFonts;
}
/**
 * Font pairs a theme may use. New families change line breaks and the atlas
 * cards are fixed-width, so a pair is added here only after it has been checked
 * against every app's key page. `var(--font-…)` lets a next/font app supply its
 * self-hosted family; a plain page falls back to the named family.
 */
export declare const VETTED_FONTS: readonly ThemeFonts[];
export declare const THEMES: readonly Theme[];
/** The theme on `:root`: what a page shows before (or without) any choice. */
export declare const BASE_THEME_ID = "classic-light";
/** System mode: which theme each `prefers-color-scheme` value maps to. */
export declare const SYSTEM_THEMES: {
    readonly light: "classic-light";
    readonly dark: "classic-dark";
};
export declare const THEME_IDS: readonly string[];
/** Small summary for pickers and docs: id, label, scheme and a few swatches. */
export declare function themeCatalogue(themes?: readonly Theme[]): {
    id: string;
    label: string;
    scheme: Scheme;
    swatches: string[];
}[];

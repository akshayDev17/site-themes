// The catalogue: the one place every theme is defined.
// Adding a theme = one entry in THEMES + a new git tag. Everything else
// (themes.css, the boot script's id list, the picker's options, the contrast
// gate) is derived from this file.
/**
 * Font pairs a theme may use. New families change line breaks and the atlas
 * cards are fixed-width, so a pair is added here only after it has been checked
 * against every app's key page. `var(--font-…)` lets a next/font app supply its
 * self-hosted family; a plain page falls back to the named family.
 */
export const VETTED_FONTS = [
    {
        serif: 'var(--font-newsreader, "Newsreader"), ui-serif, Georgia, serif',
        mono: 'var(--font-plex-mono, "IBM Plex Mono"), ui-monospace, SFMono-Regular, Menlo, monospace',
    },
];
const classicFonts = VETTED_FONTS[0];
export const THEMES = [
    {
        // Today's shared palette (home, quiz-app, ai-chat-archive, atlas).
        id: 'classic-light',
        label: 'Classic Light',
        scheme: 'light',
        color: {
            surface: '#EEF1F8',
            surface2: '#E2E8F4',
            card: '#FFFFFF',
            text: '#0F1220',
            textBody: '#232838',
            textMuted: '#525A6B',
            line: '#D3D9E6',
            lineStrong: '#BCC4D6',
            cardLine: '#818A9F',
            cardLineHover: '#5C6780',
            accent: '#3A4BD8',
            focus: '#0F1220',
            danger: '#B00020',
            warn: '#8A5A00',
            ok: '#1F6B45',
        },
        shadow: {
            rest: '0 1px 2px color-mix(in oklab, #0F1220 7%, transparent), 0 8px 20px -14px color-mix(in oklab, #0F1220 20%, transparent)',
            hover: '0 2px 4px color-mix(in oklab, #0F1220 9%, transparent), 0 20px 40px -20px color-mix(in oklab, #0F1220 28%, transparent)',
        },
        radius: { card: '.7rem' },
        font: classicFonts,
    },
    {
        // Classic, inverted: the Classic ink becomes the surface.
        id: 'classic-dark',
        label: 'Classic Dark',
        scheme: 'dark',
        color: {
            surface: '#0F1220',
            surface2: '#171B2B',
            card: '#1B2032',
            text: '#EEF1F8',
            textBody: '#D3D9E6',
            textMuted: '#A3ABBE',
            line: '#2A3045',
            lineStrong: '#3B4360',
            cardLine: '#6E7894',
            cardLineHover: '#8E97B0',
            accent: '#8E9BFF',
            focus: '#EEF1F8',
            danger: '#FF8A95',
            warn: '#E3A857',
            ok: '#5BC28C',
        },
        shadow: {
            rest: '0 1px 2px rgb(0 0 0 / .35), 0 8px 20px -14px rgb(0 0 0 / .6)',
            hover: '0 2px 4px rgb(0 0 0 / .4), 0 20px 40px -20px rgb(0 0 0 / .7)',
        },
        radius: { card: '.7rem' },
        font: classicFonts,
    },
];
/** The theme on `:root`: what a page shows before (or without) any choice. */
export const BASE_THEME_ID = 'classic-light';
/** System mode: which theme each `prefers-color-scheme` value maps to. */
export const SYSTEM_THEMES = { light: 'classic-light', dark: 'classic-dark' };
export const THEME_IDS = THEMES.map((t) => t.id);

import type { Theme, ThemeColors } from './themes.js';
type Role = keyof ThemeColors;
/** A rule: every `fg` role on every `bg` role must reach `min`. */
interface Rule {
    fg: Role[];
    bg: Role[];
    min: number;
}
/**
 * Thresholds (report section 3.5.5):
 * - 4.5:1 for text, textBody and textMuted on surface, surface2 and card (WCAG 1.4.3);
 * - 4.5:1 for accent, on the same three surfaces (it is used as link/label text);
 * - 3:1 for cardLine and focus (WCAG 1.4.11). The card border separates a card
 *   from the page it sits on, so it is measured against surface and card; the
 *   focus ring can land on any of the three surfaces.
 * - line / lineStrong are decorative dividers and exempt.
 */
export declare const CONTRAST_RULES: readonly Rule[];
export interface ContrastResult {
    theme: string;
    fg: Role;
    bg: Role;
    ratio: number;
    min: number;
    pass: boolean;
}
/** Parses #RGB or #RRGGBB into 0-255 channels. */
export declare function parseHex(hex: string): [number, number, number];
/** WCAG relative luminance. */
export declare function luminance(hex: string): number;
export declare function contrastRatio(a: string, b: string): number;
/** Every rule applied to every theme. Ratios are not rounded before comparing. */
export declare function checkContrast(themes: readonly Theme[]): ContrastResult[];
export {};

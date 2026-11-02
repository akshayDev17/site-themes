// WCAG 2.x contrast and the catalogue's contrast gate.
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
export const CONTRAST_RULES: readonly Rule[] = [
  { fg: ['text', 'textBody', 'textMuted'], bg: ['surface', 'surface2', 'card'], min: 4.5 },
  { fg: ['accent'], bg: ['surface', 'surface2', 'card'], min: 4.5 },
  { fg: ['cardLine'], bg: ['surface', 'card'], min: 3 },
  { fg: ['focus'], bg: ['surface', 'surface2', 'card'], min: 3 },
];

export interface ContrastResult {
  theme: string;
  fg: Role;
  bg: Role;
  ratio: number;
  min: number;
  pass: boolean;
}

/** Parses #RGB or #RRGGBB into 0-255 channels. */
export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #RGB/#RRGGBB colour: ${hex}`);
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every rule applied to every theme. Ratios are not rounded before comparing. */
export function checkContrast(themes: readonly Theme[]): ContrastResult[] {
  return themes.flatMap((theme) =>
    CONTRAST_RULES.flatMap((rule) =>
      rule.fg.flatMap((fg) =>
        rule.bg.map((bg) => {
          const ratio = contrastRatio(theme.color[fg], theme.color[bg]);
          return { theme: theme.id, fg, bg, ratio, min: rule.min, pass: ratio >= rule.min };
        }),
      ),
    ),
  );
}

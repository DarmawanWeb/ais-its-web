/**
 * Colour tokens for canvas renderers (deck.gl, MapLibre paint properties, recharts) that
 * cannot read CSS variables. Keep in sync with src/styles/globals.css.
 */
export type Rgba = [number, number, number, number];

/** CII rating grade colours (fixed in both themes). */
export const CII_GRADE_COLORS = {
  A: '#15803d',
  B: '#65a30d',
  C: '#ca8a04',
  D: '#ea580c',
  E: '#dc2626',
} as const;

/** Safety state colours used by the vessel ring and legends. */
export const SAFETY_COLORS = {
  ewsDanger: [239, 68, 68, 255] as Rgba,
  ewsWarning: [245, 158, 11, 255] as Rgba,
  collisionHigh: [217, 70, 239, 255] as Rgba,
  collisionMedium: [168, 85, 247, 230] as Rgba,
  selected: [56, 189, 248, 255] as Rgba,
} as const;

/** Categorical chart palette (CSS variables --chart-1 … --chart-8). */
export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
] as const;

export function rgbaToCss([r, g, b, a]: Rgba): string {
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

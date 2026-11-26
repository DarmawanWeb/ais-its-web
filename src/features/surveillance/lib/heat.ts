import type { ResolvedTheme } from '@/shared/theme/theme';
import type { Rgba } from '@/shared/theme/tokens';

/**
 * Sequential single-hue ramps (violet), distinct from the severity colours of the event markers
 * drawn on top: density runs from the background's tone to the strongest contrast with it, so
 * the dark theme ramps dark → light and the light theme light → dark.
 */
export const HEAT_RANGES: Readonly<Record<ResolvedTheme, readonly Rgba[]>> = {
  dark: [
    [91, 33, 182, 40],
    [109, 40, 217, 110],
    [139, 92, 246, 160],
    [167, 139, 250, 200],
    [196, 181, 253, 230],
    [237, 233, 254, 255],
  ],
  light: [
    [196, 181, 253, 60],
    [167, 139, 250, 120],
    [139, 92, 246, 170],
    [124, 58, 237, 210],
    [109, 40, 217, 235],
    [76, 29, 149, 255],
  ],
};

/** CSS gradient of a heat ramp (legend). */
export function heatGradientCss(range: readonly Rgba[]): string {
  const stops = range.map(
    ([r, g, b, a], index) =>
      `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)}) ${Math.round((index / Math.max(1, range.length - 1)) * 100)}%`,
  );
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

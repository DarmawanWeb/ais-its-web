import type { ZoneKind } from '@darmawanweb/ais-its-contracts/domain';

import type { Rgba } from '@/shared/theme/tokens';

/**
 * Map colour of each zone kind (deck.gl layers and their legend swatches). The kind is always
 * also written out (badges, tooltips, legend labels), never shown by colour alone.
 */
export const KIND_COLORS: Readonly<Record<ZoneKind, [number, number, number]>> = {
  pipeline: [245, 158, 11],
  transhipment_area: [56, 189, 248],
  fishing_ground: [52, 211, 153],
  mpa: [45, 212, 191],
  restricted: [239, 68, 68],
  anchorage: [167, 139, 250],
  port: [129, 140, 248],
  tss_lane: [96, 165, 250],
  shallow_water: [250, 204, 21],
  custom: [244, 114, 182],
};

export function kindColor(kind: string, alpha = 255): Rgba {
  const [r, g, b] = KIND_COLORS[kind as ZoneKind] ?? [148, 163, 184];
  return [r, g, b, alpha];
}

export function kindCss(kind: string, alpha = 1): string {
  const [r, g, b] = KIND_COLORS[kind as ZoneKind] ?? [148, 163, 184];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

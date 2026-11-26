import { type Rgba, SAFETY_COLORS } from '@/shared/theme/tokens';

/**
 * Colours of the safety maps (deck.gl cannot read CSS variables). EWS danger / warning and the
 * collision bands reuse SAFETY_COLORS so the maps match the live map's rings and legend.
 */
export const SAFE_COLOR: Rgba = [45, 212, 191, 255];
export const PIPELINE_COLOR: Rgba = [251, 146, 60, 255];
export const LOW_RISK_COLOR: Rgba = [96, 165, 250, 255];
/** Track colours of the two vessels of an encounter (vessel A cyan, vessel B amber). */
export const VESSEL_A_COLOR: Rgba = [56, 189, 248, 255];
export const VESSEL_B_COLOR: Rgba = [250, 204, 21, 255];

export function ewsColor(status: number): Rgba {
  if (status === 0) return SAFETY_COLORS.ewsDanger;
  if (status === 1) return SAFETY_COLORS.ewsWarning;
  return SAFE_COLOR;
}

export function riskColor(risk: string): Rgba {
  if (risk === 'high') return SAFETY_COLORS.collisionHigh;
  if (risk === 'medium') return SAFETY_COLORS.collisionMedium;
  if (risk === 'low') return LOW_RISK_COLOR;
  return [148, 163, 184, 255];
}

export function withAlpha([r, g, b]: Rgba, alpha: number): Rgba {
  return [r, g, b, alpha];
}

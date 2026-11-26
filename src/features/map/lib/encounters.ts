import type { EncounterDto } from '@/shared/api/generated/safety/model';
import { type Rgba, SAFETY_COLORS } from '@/shared/theme/tokens';

/** Colour of a risk band (collision rings of the live map; low = info blue). */
export function riskRgba(risk: string): Rgba {
  if (risk === 'high') return SAFETY_COLORS.collisionHigh;
  if (risk === 'medium') return SAFETY_COLORS.collisionMedium;
  return [96, 165, 250, 255];
}

/**
 * Active collision encounters drawn on the live map (spec §14): the pair line between the two
 * vessels at the latest sample, and the closest point of approach — both vessels dead-reckoned
 * along their COG/SOG for TCPA minutes (the relative-motion model of `collision.cpa_tcpa`).
 */
export interface EncounterOverlay {
  id: string;
  mmsiA: number;
  mmsiB: number;
  risk: string;
  cpaNm: number;
  tcpaMin: number | null;
  /** [lon, lat] at the latest sample. */
  a: [number, number];
  b: [number, number];
  /** Predicted positions at the CPA (equal to a / b without a TCPA). */
  cpaA: [number, number];
  cpaB: [number, number];
  /** Midpoint of the two predicted positions. */
  cpaPoint: [number, number];
  time: string;
}

const RAD = Math.PI / 180;

/** Position after `minutes` at `sog` knots on `cog` degrees (flat-earth, fine within a few nm). */
export function deadReckon(
  [lon, lat]: [number, number],
  cogDeg: number,
  sogKn: number,
  minutes: number,
): [number, number] {
  if (!Number.isFinite(cogDeg) || cogDeg >= 360 || !Number.isFinite(sogKn) || sogKn >= 102.3)
    return [lon, lat];
  const nm = (sogKn * minutes) / 60;
  const dLat = (nm / 60) * Math.cos(cogDeg * RAD);
  const dLon = ((nm / 60) * Math.sin(cogDeg * RAD)) / Math.max(0.01, Math.cos(lat * RAD));
  return [lon + dLon, lat + dLat];
}

export function encounterOverlays(encounters: readonly EncounterDto[]): EncounterOverlay[] {
  const overlays: EncounterOverlay[] = [];
  for (const encounter of encounters) {
    const sample = encounter.history.at(-1);
    if (!sample) continue;
    const { a, b } = sample.positions;
    const posA: [number, number] = [a.lon, a.lat];
    const posB: [number, number] = [b.lon, b.lat];
    const tcpa = sample.tcpaMin !== null && sample.tcpaMin > 0 ? sample.tcpaMin : null;
    const cpaA = tcpa === null ? posA : deadReckon(posA, a.cog, a.sog, tcpa);
    const cpaB = tcpa === null ? posB : deadReckon(posB, b.cog, b.sog, tcpa);
    overlays.push({
      id: encounter.encounterId,
      mmsiA: encounter.mmsiA,
      mmsiB: encounter.mmsiB,
      risk: sample.risk,
      cpaNm: sample.cpaNm,
      tcpaMin: sample.tcpaMin,
      a: posA,
      b: posB,
      cpaA,
      cpaB,
      cpaPoint: [(cpaA[0] + cpaB[0]) / 2, (cpaA[1] + cpaB[1]) / 2],
      time: sample.time,
    });
  }
  return overlays;
}

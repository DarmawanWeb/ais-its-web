import { useQuery } from '@tanstack/react-query';

import { SAFETY_COLORS } from '@/shared/theme/tokens';

/**
 * Vessel icon atlas built at runtime from the legacy ship-type icons in public/ships
 * (50×50 PNG arrows pointing north). Icon names follow the legacy `icon` codes, which match
 * the 12 IMO CII ship types; fleet vessel type codes are mapped through aliases.
 */
export const VESSEL_ICON_NAMES = [
  'bulkca',
  'combin',
  'contai',
  'cruise',
  'gascar',
  'genera',
  'lngcar',
  'refrig',
  'ro-roc',
  'ro-rop',
  'ro-rov',
  'tanker',
  'unknown',
] as const;

export type VesselIconName = (typeof VESSEL_ICON_NAMES)[number];

/** Dashed ring of medium collision risk (drawn into the same atlas). */
export const DASHED_RING_ICON = 'ring-dashed';

const ICON_ALIASES: Readonly<Record<string, VesselIconName>> = {
  bulk: 'bulkca',
  bulk_carrier: 'bulkca',
  combination: 'combin',
  combination_carrier: 'combin',
  container: 'contai',
  container_ship: 'contai',
  cruise: 'cruise',
  cruise_passenger_ship: 'cruise',
  passenger: 'ro-rop',
  gas: 'gascar',
  gas_carrier: 'gascar',
  lng: 'lngcar',
  lng_carrier: 'lngcar',
  general_cargo: 'genera',
  general_cargo_ship: 'genera',
  cargo: 'genera',
  refrigerated: 'refrig',
  refrigerated_cargo_carrier: 'refrig',
  reefer: 'refrig',
  ro_ro_cargo: 'ro-roc',
  ro_ro_cargo_ship: 'ro-roc',
  ro_ro_passenger: 'ro-rop',
  ro_ro_passenger_ship: 'ro-rop',
  ro_pax: 'ro-rop',
  ro_ro_cargo_ship_vc: 'ro-rov',
  vehicle_carrier: 'ro-rov',
  ro_ro_vehicle: 'ro-rov',
  tanker: 'tanker',
  oil_tanker: 'tanker',
  chemical_tanker: 'tanker',
};

const NAMES = new Set<string>(VESSEL_ICON_NAMES);

/** Icon of a vessel type code / legacy icon code (unknown → "unknown"). */
export function vesselIconName(code: string | null | undefined): VesselIconName {
  if (!code) return 'unknown';
  const lower = code.trim().toLowerCase();
  if (NAMES.has(lower)) return lower as VesselIconName;
  const normalized = lower.replace(/[\s-]+/g, '_');
  return ICON_ALIASES[normalized] ?? 'unknown';
}

export interface IconMappingEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  mask: boolean;
}

export interface VesselIconAtlas {
  /** PNG data URL of the packed atlas. */
  url: string;
  mapping: Record<VesselIconName | typeof DASHED_RING_ICON, IconMappingEntry>;
}

const ICON_SIZE = 50;
const CELL = 58;
const PADDING = (CELL - ICON_SIZE) / 2;
/** The dashed ring: a RING_RADIUS circle in a RING_CELL square (scaled by the layer). */
export const RING_CELL = 64;
export const RING_RADIUS = 26;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

function drawFallbackArrow(context: CanvasRenderingContext2D, x: number, y: number): void {
  context.save();
  context.fillStyle = '#94a3b8';
  context.beginPath();
  context.moveTo(x + ICON_SIZE / 2, y + 4);
  context.lineTo(x + ICON_SIZE - 12, y + ICON_SIZE - 6);
  context.lineTo(x + ICON_SIZE / 2, y + ICON_SIZE - 14);
  context.lineTo(x + 12, y + ICON_SIZE - 6);
  context.closePath();
  context.fill();
  context.restore();
}

/** Ten dashes with a dark outline, so the ring reads on light and dark basemaps alike. */
function drawDashedRing(
  context: CanvasRenderingContext2D,
  x: number,
  [r, g, b]: readonly number[],
): void {
  const center = x + RING_CELL / 2;
  const segment = (2 * Math.PI * RING_RADIUS) / 10;
  context.save();
  context.beginPath();
  context.arc(center, RING_CELL / 2, RING_RADIUS, 0, 2 * Math.PI);
  context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.18)`;
  context.fill();
  context.setLineDash([segment * 0.62, segment * 0.38]);
  context.lineWidth = 7;
  context.strokeStyle = 'rgba(7, 13, 23, 0.7)';
  context.stroke();
  context.lineWidth = 4;
  context.strokeStyle = `rgb(${r}, ${g}, ${b})`;
  context.stroke();
  context.restore();
}

export async function buildVesselIconAtlas(baseUrl = '/ships'): Promise<VesselIconAtlas> {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * VESSEL_ICON_NAMES.length + RING_CELL;
  canvas.height = Math.max(CELL, RING_CELL);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is not available');
  const mapping = {} as VesselIconAtlas['mapping'];
  const images = await Promise.allSettled(
    VESSEL_ICON_NAMES.map((name) => loadImage(`${baseUrl}/${name}.png`)),
  );
  VESSEL_ICON_NAMES.forEach((name, index) => {
    const x = index * CELL + PADDING;
    const result = images[index];
    if (result?.status === 'fulfilled')
      context.drawImage(result.value, x, PADDING, ICON_SIZE, ICON_SIZE);
    else drawFallbackArrow(context, x, PADDING);
    mapping[name] = {
      x,
      y: PADDING,
      width: ICON_SIZE,
      height: ICON_SIZE,
      anchorX: ICON_SIZE / 2,
      anchorY: ICON_SIZE / 2,
      mask: false,
    };
  });
  const ringX = CELL * VESSEL_ICON_NAMES.length;
  drawDashedRing(context, ringX, SAFETY_COLORS.collisionMedium);
  mapping[DASHED_RING_ICON] = {
    x: ringX,
    y: 0,
    width: RING_CELL,
    height: RING_CELL,
    anchorX: RING_CELL / 2,
    anchorY: RING_CELL / 2,
    mask: false,
  };
  return { url: canvas.toDataURL('image/png'), mapping };
}

/** The atlas, built once per session. */
export function useVesselIconAtlas() {
  return useQuery({
    queryKey: ['map', 'vessel-icon-atlas'],
    queryFn: () => buildVesselIconAtlas(),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
}

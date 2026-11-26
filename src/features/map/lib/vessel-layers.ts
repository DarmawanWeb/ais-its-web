import type { BinaryAttribute, Layer, LayerData, PickingInfo } from '@deck.gl/core';
import { CollisionFilterExtension, type CollisionFilterExtensionProps } from '@deck.gl/extensions';
import { IconLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';

import {
  DASHED_RING_ICON,
  RING_CELL,
  RING_RADIUS,
  type VesselIconAtlas,
  type VesselIconName,
} from '@/shared/map/vessel-icons';
import { safetyRingKind, vesselHeading } from '@/shared/map/vessel-layer';
import type { VesselLiveRecord } from '@/shared/realtime/vessel-store';
import {
  type Rgba,
  SAFETY_COLORS,
  SAFETY_RING_STYLES,
  type SafetyRingKind,
} from '@/shared/theme/tokens';

import { vesselCategory, type SafetyClass } from './vessel-filters';
import { MAP_FONT } from '@/shared/map/constants';

/**
 * Live vessel rendering for up to ~10 000 vessels:
 *  - level of detail by zoom: grid clusters → dots → rotated ship-type icons (+ names);
 *  - binary attributes: positions, angles, colours and radii are typed arrays built in one pass
 *    per (throttled) snapshot, so deck.gl uploads buffers instead of calling accessors per vessel;
 *  - safety rings (solid / dashed) as separate subsets, the selection halo on top.
 */
export type VesselLod = 'cluster' | 'dot' | 'icon';

/** Below this zoom vessels are clustered. */
export const CLUSTER_MAX_ZOOM = 6;
/** From this zoom vessels are drawn as rotated ship-type icons. */
export const ICON_MIN_ZOOM = 8.5;
/** From this zoom icons carry the vessel name. */
export const LABEL_MIN_ZOOM = 11.5;
const MAX_LABELS = 1_500;

/**
 * Above this many vessels in view, icons give way to dots: ~20 px icons would only pile up
 * (a busy anchorage), and dots are the cheaper layer when the map is that full.
 */
export const ICON_MAX_VESSELS = 3_000;

export function vesselLod(zoom: number, vesselsInView = 0): VesselLod {
  if (zoom < CLUSTER_MAX_ZOOM) return 'cluster';
  if (zoom < ICON_MIN_ZOOM || vesselsInView > ICON_MAX_VESSELS) return 'dot';
  return 'icon';
}

/** Normal vessels as dots: light slate with a dark outline (reads on dark and light basemaps). */
export const NORMAL_DOT_COLOR: Rgba = [226, 232, 240, 255];
const OUTLINE: Rgba = [7, 13, 23, 235];

/** Precedence of the safety classes (same order as the ring: EWS before collision). */
export const SAFETY_RANK: Readonly<Record<SafetyClass, number>> = {
  normal: 0,
  collisionMedium: 1,
  collisionHigh: 2,
  ewsWarning: 3,
  ewsDanger: 4,
};

export function withAlpha([r, g, b]: Rgba, alpha: number): Rgba {
  return [r, g, b, alpha];
}

export function safetyColor(kind: SafetyClass): Rgba {
  return kind === 'normal' ? NORMAL_DOT_COLOR : SAFETY_COLORS[kind];
}

interface RingSubset {
  length: number;
  /** Index of each ring in the full buffers. */
  indices: Uint32Array;
  positions: Float64Array;
  colors: Uint8Array;
  widths: Float32Array;
}

export interface VesselBuffers {
  length: number;
  records: readonly VesselLiveRecord[];
  positions: Float64Array;
  angles: Float32Array;
  icons: VesselIconName[];
  fillColors: Uint8Array;
  radii: Float32Array;
  solidRings: RingSubset;
  dashedRings: RingSubset;
}

function subset(
  indices: number[],
  records: readonly VesselLiveRecord[],
  kinds: SafetyRingKind[],
): RingSubset {
  const n = indices.length;
  const positions = new Float64Array(n * 2);
  const colors = new Uint8Array(n * 4);
  const widths = new Float32Array(n);
  indices.forEach((index, i) => {
    const record = records[index] as VesselLiveRecord;
    const kind = kinds[i] as SafetyRingKind;
    const color = SAFETY_COLORS[kind];
    positions[i * 2] = record.lon;
    positions[i * 2 + 1] = record.lat;
    colors.set(color, i * 4);
    widths[i] = SAFETY_RING_STYLES[kind].width;
  });
  return { length: n, indices: Uint32Array.from(indices), positions, colors, widths };
}

/** Typed arrays of one snapshot (one pass over the records). */
export function buildVesselBuffers(records: readonly VesselLiveRecord[]): VesselBuffers {
  const n = records.length;
  const positions = new Float64Array(n * 2);
  const angles = new Float32Array(n);
  const fillColors = new Uint8Array(n * 4);
  const radii = new Float32Array(n);
  const icons: VesselIconName[] = new Array<VesselIconName>(n);
  const solid: number[] = [];
  const solidKinds: SafetyRingKind[] = [];
  const dashed: number[] = [];
  const dashedKinds: SafetyRingKind[] = [];
  for (let i = 0; i < n; i++) {
    const record = records[i] as VesselLiveRecord;
    positions[i * 2] = record.lon;
    positions[i * 2 + 1] = record.lat;
    angles[i] = -vesselHeading(record);
    icons[i] = vesselCategory(record);
    const kind = safetyRingKind(record);
    fillColors.set(kind ? SAFETY_COLORS[kind] : NORMAL_DOT_COLOR, i * 4);
    radii[i] = kind ? 4.5 : 3;
    if (kind) {
      if (SAFETY_RING_STYLES[kind].line === 'dashed') {
        dashed.push(i);
        dashedKinds.push(kind);
      } else {
        solid.push(i);
        solidKinds.push(kind);
      }
    }
  }
  return {
    length: n,
    records,
    positions,
    angles,
    icons,
    fillColors,
    radii,
    solidRings: subset(solid, records, solidKinds),
    dashedRings: subset(dashed, records, dashedKinds),
  };
}

export interface VesselCluster {
  /** [lon, lat] mean position. */
  position: [number, number];
  count: number;
  /** Most severe safety class in the cluster. */
  worst: SafetyClass;
  /** Vessels in the worst class. */
  flagged: number;
}

/** Screen-grid clustering (cells of ~`cellPx` pixels at this zoom), O(n). */
export function clusterVessels(
  records: readonly VesselLiveRecord[],
  zoom: number,
  cellPx = 64,
): VesselCluster[] {
  const cellDeg = (360 / 2 ** Math.max(0, zoom)) * (cellPx / 512);
  const cells = new Map<
    string,
    { lon: number; lat: number; count: number; worst: SafetyClass; flagged: number }
  >();
  for (const record of records) {
    const key = `${Math.floor(record.lon / cellDeg)}:${Math.floor(record.lat / cellDeg)}`;
    const kind: SafetyClass = safetyRingKind(record) ?? 'normal';
    const cell = cells.get(key);
    if (!cell) {
      cells.set(key, {
        lon: record.lon,
        lat: record.lat,
        count: 1,
        worst: kind,
        flagged: kind === 'normal' ? 0 : 1,
      });
      continue;
    }
    cell.lon += record.lon;
    cell.lat += record.lat;
    cell.count += 1;
    if (SAFETY_RANK[kind] > SAFETY_RANK[cell.worst]) {
      cell.worst = kind;
      cell.flagged = 1;
    } else if (kind === cell.worst && kind !== 'normal') cell.flagged += 1;
  }
  return [...cells.values()].map((cell) => ({
    position: [cell.lon / cell.count, cell.lat / cell.count],
    count: cell.count,
    worst: cell.worst,
    flagged: cell.flagged,
  }));
}

export interface VesselLayerHandlers {
  onSelect?: (record: VesselLiveRecord) => void;
  onHover?: (record: VesselLiveRecord | null, x: number, y: number) => void;
  onClusterClick?: (cluster: VesselCluster) => void;
}

export interface VesselLayerOptions extends VesselLayerHandlers {
  id?: string;
  lod: VesselLod;
  zoom: number;
  atlas: VesselIconAtlas | null;
  selected: VesselLiveRecord | null;
  iconSize?: number;
}

/** Non-iterable deck.gl data: `length` rows whose attributes are typed arrays. */
function binary(length: number, attributes: Record<string, BinaryAttribute>): LayerData<unknown> {
  return { length, attributes };
}

/** deck.gl layers of the vessels at the current level of detail (bottom to top). */
export function createVesselLayers(
  buffers: VesselBuffers,
  clusters: readonly VesselCluster[] | null,
  options: VesselLayerOptions,
): Layer[] {
  const {
    id = 'live-vessels',
    lod,
    zoom,
    atlas,
    selected,
    onSelect,
    onHover,
    onClusterClick,
  } = options;
  const iconSize = options.iconSize ?? (zoom >= 12 ? 26 : 22);
  const records = buffers.records;
  const pick = (info: PickingInfo) => (info.index >= 0 ? (records[info.index] ?? null) : null);
  const hover = (info: PickingInfo) => onHover?.(pick(info), info.x, info.y);
  const click = (info: PickingInfo) => {
    const record = pick(info);
    if (record) onSelect?.(record);
    return !!record;
  };

  if (lod === 'cluster' && clusters) {
    const radius = (cluster: VesselCluster) => Math.min(30, 9 + Math.sqrt(cluster.count) * 2.2);
    return [
      new ScatterplotLayer<VesselCluster>({
        id: `${id}-clusters`,
        data: clusters as VesselCluster[],
        getPosition: (d) => d.position,
        radiusUnits: 'pixels',
        getRadius: radius,
        filled: true,
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: (d) => (d.worst === 'normal' ? 1.5 : 3),
        getFillColor: (d) =>
          d.worst === 'normal' ? [15, 118, 150, 200] : withAlpha(safetyColor(d.worst), 200),
        getLineColor: (d) => (d.worst === 'normal' ? [186, 230, 253, 220] : [255, 255, 255, 235]),
        pickable: true,
        onClick: (info) => {
          const cluster = info.object as VesselCluster | undefined;
          if (cluster) onClusterClick?.(cluster);
          return !!cluster;
        },
      }),
      new TextLayer<VesselCluster>({
        id: `${id}-cluster-counts`,
        data: clusters as VesselCluster[],
        getPosition: (d) => d.position,
        getText: (d) => (d.count >= 1000 ? `${Math.round(d.count / 100) / 10}k` : String(d.count)),
        getSize: 12,
        getColor: [255, 255, 255, 255],
        fontWeight: 700,
        characterSet: 'auto',
        fontFamily: MAP_FONT,
        fontSettings: { sdf: true },
        outlineWidth: 2,
        outlineColor: [7, 13, 23, 200],
      }),
    ];
  }

  const ringRadius = lod === 'icon' ? iconSize * 0.7 : 9;
  const layers: Layer[] = [];
  const solid = buffers.solidRings;
  if (solid.length > 0) {
    layers.push(
      new ScatterplotLayer({
        id: `${id}-ring`,
        data: binary(solid.length, {
          getPosition: { value: solid.positions, size: 2 },
          getLineColor: { value: solid.colors, size: 4 },
          getLineWidth: { value: solid.widths, size: 1 },
        }),
        radiusUnits: 'pixels',
        getRadius: ringRadius,
        stroked: true,
        filled: true,
        getFillColor: [255, 255, 255, 18],
        lineWidthUnits: 'pixels',
      }),
    );
  }
  const dashed = buffers.dashedRings;
  if (atlas?.mapping[DASHED_RING_ICON] && dashed.length > 0) {
    layers.push(
      new IconLayer({
        id: `${id}-ring-dashed`,
        data: binary(dashed.length, { getPosition: { value: dashed.positions, size: 2 } }),
        iconAtlas: atlas.url,
        iconMapping: atlas.mapping,
        getIcon: () => DASHED_RING_ICON,
        getSize: (ringRadius * RING_CELL) / RING_RADIUS,
        sizeUnits: 'pixels',
        billboard: true,
      }),
    );
  }

  if (lod === 'icon' && atlas) {
    layers.push(
      new IconLayer({
        id: `${id}-icons`,
        data: binary(buffers.length, {
          getPosition: { value: buffers.positions, size: 2 },
          getAngle: { value: buffers.angles, size: 1 },
        }),
        iconAtlas: atlas.url,
        iconMapping: atlas.mapping,
        getIcon: (_: unknown, { index }: { index: number }) => buffers.icons[index] ?? 'unknown',
        updateTriggers: { getIcon: buffers.icons },
        getSize: iconSize,
        sizeUnits: 'pixels',
        alphaCutoff: 0.05,
        pickable: true,
        onClick: click,
        onHover: hover,
      }),
    );
    if (zoom >= LABEL_MIN_ZOOM) {
      const labelled = records.slice(0, MAX_LABELS);
      layers.push(
        new TextLayer<VesselLiveRecord, CollisionFilterExtensionProps<VesselLiveRecord>>({
          id: `${id}-labels`,
          data: labelled,
          getPosition: (record) => [record.lon, record.lat],
          getText: (record) => record.vessel?.name ?? String(record.mmsi),
          getSize: 11,
          getPixelOffset: [0, iconSize * 0.75 + 4],
          getColor: [241, 245, 249, 255],
          outlineWidth: 3,
          outlineColor: [7, 13, 23, 220],
          fontSettings: { sdf: true },
          fontWeight: 600,
          characterSet: 'auto',
          fontFamily: MAP_FONT,
          extensions: [new CollisionFilterExtension()],
          collisionGroup: 'vessel-labels',
          getCollisionPriority: (record: VesselLiveRecord) => (safetyRingKind(record) ? 10 : 0),
        }),
      );
    }
  } else {
    layers.push(
      new ScatterplotLayer({
        id: `${id}-dots`,
        data: binary(buffers.length, {
          getPosition: { value: buffers.positions, size: 2 },
          getFillColor: { value: buffers.fillColors, size: 4 },
          getRadius: { value: buffers.radii, size: 1 },
        }),
        radiusUnits: 'pixels',
        stroked: true,
        getLineColor: OUTLINE,
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        pickable: true,
        autoHighlight: true,
        highlightColor: [56, 189, 248, 255],
        onClick: click,
        onHover: hover,
      }),
    );
  }

  if (selected) {
    layers.push(
      new ScatterplotLayer<VesselLiveRecord>({
        id: `${id}-selection`,
        data: [selected],
        getPosition: (record) => [record.lon, record.lat],
        radiusUnits: 'pixels',
        getRadius: lod === 'icon' ? iconSize * 0.95 : 12,
        stroked: true,
        filled: false,
        lineWidthUnits: 'pixels',
        getLineWidth: 3,
        getLineColor: SAFETY_COLORS.selected,
      }),
    );
  }
  return layers;
}

import { COG_NOT_AVAILABLE, HEADING_NOT_AVAILABLE } from '@darmawanweb/ais-its-contracts/domain';
import type { Layer, PickingInfo } from '@deck.gl/core';
import { IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import { useCallback, useMemo } from 'react';

import type { VesselLiveRecord } from '@/shared/realtime/vessel-store';
import {
  type Rgba,
  SAFETY_COLORS,
  SAFETY_RING_STYLES,
  type SafetyRingKind,
} from '@/shared/theme/tokens';

import { useDeckLayers } from './hooks';
import type { MapTooltip } from './layer-registry';
import {
  DASHED_RING_ICON,
  RING_CELL,
  RING_RADIUS,
  useVesselIconAtlas,
  vesselIconName,
  type VesselIconAtlas,
} from './vessel-icons';

/** Heading for the icon rotation: true heading, else course over ground, else north. */
export function vesselHeading(record: Pick<VesselLiveRecord, 'position'>): number {
  const position = record.position;
  if (!position) return 0;
  if (
    Number.isFinite(position.hdg) &&
    position.hdg !== HEADING_NOT_AVAILABLE &&
    position.hdg < 360
  ) {
    return position.hdg;
  }
  if (Number.isFinite(position.cog) && position.cog < COG_NOT_AVAILABLE) return position.cog;
  return 0;
}

/**
 * Safety state behind a vessel's ring (spec §14: vessels coloured by safety state):
 * EWS danger > EWS warning > collision risk high > medium; null when normal.
 */
export function safetyRingKind(record: Pick<VesselLiveRecord, 'safety'>): SafetyRingKind | null {
  const safety = record.safety;
  if (!safety) return null;
  if (safety.ewsStatus === 0) return 'ewsDanger';
  if (safety.ewsStatus === 1) return 'ewsWarning';
  if (safety.collisionRisk === 'high') return 'collisionHigh';
  if (safety.collisionRisk === 'medium') return 'collisionMedium';
  return null;
}

/** Ring colour of the safety state; null when normal. */
export function safetyRingColor(record: Pick<VesselLiveRecord, 'safety'>): Rgba | null {
  const kind = safetyRingKind(record);
  return kind ? SAFETY_COLORS[kind] : null;
}

export interface VesselLayerOptions {
  id?: string;
  atlas?: VesselIconAtlas | null;
  selectedMmsi?: number | null;
  onClick?: (record: VesselLiveRecord) => void;
  /** Icon size in pixels. */
  iconSize?: number;
}

/**
 * deck.gl layers of live vessels, bottom to top: solid safety rings, dashed rings (medium
 * collision risk, from the icon atlas), the selection halo and the rotated ship-type icons
 * (dots until the atlas loads). The selected vessel keeps its safety ring.
 */
export function createVesselLayers(
  records: readonly VesselLiveRecord[],
  options: VesselLayerOptions = {},
): Layer[] {
  const { id = 'vessels', atlas, selectedMmsi = null, onClick, iconSize = 22 } = options;
  const data = records as VesselLiveRecord[];
  const dashedIcon = atlas?.mapping[DASHED_RING_ICON] ? DASHED_RING_ICON : null;
  const solid: VesselLiveRecord[] = [];
  const dashed: VesselLiveRecord[] = [];
  for (const record of data) {
    const kind = safetyRingKind(record);
    if (!kind) continue;
    if (SAFETY_RING_STYLES[kind].line === 'dashed' && dashedIcon) dashed.push(record);
    else solid.push(record);
  }
  const selected = selectedMmsi === null ? [] : data.filter((r) => r.mmsi === selectedMmsi);
  const ringRadius = iconSize * 0.7;
  const handleClick = (info: PickingInfo<VesselLiveRecord>) => {
    if (info.object) onClick?.(info.object);
    return !!info.object;
  };
  const position = (record: VesselLiveRecord): [number, number] => [record.lon, record.lat];

  const layers: Layer[] = [
    new ScatterplotLayer<VesselLiveRecord>({
      id: `${id}-ring`,
      data: solid,
      getPosition: position,
      radiusUnits: 'pixels',
      getRadius: ringRadius,
      stroked: true,
      filled: true,
      lineWidthUnits: 'pixels',
      getLineWidth: (record) => {
        const kind = safetyRingKind(record);
        return kind ? SAFETY_RING_STYLES[kind].width : 2;
      },
      getLineColor: (record) => safetyRingColor(record) ?? SAFETY_COLORS.selected,
      getFillColor: (record) => {
        const color = safetyRingColor(record) ?? SAFETY_COLORS.selected;
        return [color[0], color[1], color[2], 46];
      },
    }),
  ];
  if (atlas && dashedIcon && dashed.length > 0) {
    layers.push(
      new IconLayer<VesselLiveRecord>({
        id: `${id}-ring-dashed`,
        data: dashed,
        iconAtlas: atlas.url,
        iconMapping: atlas.mapping,
        getIcon: () => dashedIcon,
        getPosition: position,
        // The atlas ring has RING_RADIUS px in a RING_CELL px square: scale it to ringRadius.
        getSize: (ringRadius * RING_CELL) / RING_RADIUS,
        sizeUnits: 'pixels',
        billboard: true,
      }),
    );
  }
  layers.push(
    new ScatterplotLayer<VesselLiveRecord>({
      id: `${id}-selection`,
      data: selected,
      getPosition: position,
      radiusUnits: 'pixels',
      getRadius: iconSize * 0.95,
      stroked: true,
      filled: false,
      lineWidthUnits: 'pixels',
      getLineWidth: 3,
      getLineColor: SAFETY_COLORS.selected,
    }),
  );

  layers.push(
    atlas
      ? new IconLayer<VesselLiveRecord>({
          id: `${id}-icons`,
          data,
          iconAtlas: atlas.url,
          iconMapping: atlas.mapping,
          getIcon: (record) => vesselIconName(record.vessel?.typeCode),
          getPosition: position,
          getAngle: (record) => -vesselHeading(record),
          getSize: iconSize,
          sizeUnits: 'pixels',
          alphaCutoff: 0.05,
          pickable: true,
          onClick: handleClick,
        })
      : new ScatterplotLayer<VesselLiveRecord>({
          id: `${id}-dots`,
          data,
          getPosition: position,
          radiusUnits: 'pixels',
          getRadius: 4,
          getFillColor: [56, 189, 248, 230],
          stroked: true,
          getLineColor: [7, 13, 23, 255],
          lineWidthUnits: 'pixels',
          getLineWidth: 1,
          pickable: true,
          onClick: handleClick,
        }),
  );
  return layers;
}

function vesselTooltip(info: PickingInfo): MapTooltip {
  const record = info.object as VesselLiveRecord | undefined;
  if (!record) return null;
  const name = record.vessel?.name ?? `MMSI ${record.mmsi}`;
  const sog = record.position ? `${record.position.sog.toFixed(1)} kn` : '';
  return {
    text: `${name}\n${record.mmsi}${sog ? ` · ${sog}` : ''}`,
    className: 'deck-tooltip',
  };
}

/**
 * Renders live vessels inside a MapView:
 *   const { vessels } = useViewportPositions(viewport.bbox, viewport.zoom);
 *   <VesselLayer vessels={vessels} selectedMmsi={mmsi} onSelect={(v) => setMmsi(v.mmsi)} />
 */
export function VesselLayer({
  vessels,
  selectedMmsi = null,
  onSelect,
  id = 'vessels',
  order = 100,
  iconSize,
}: {
  vessels: readonly VesselLiveRecord[];
  selectedMmsi?: number | null;
  onSelect?: (record: VesselLiveRecord) => void;
  id?: string;
  order?: number;
  iconSize?: number;
}): null {
  const atlas = useVesselIconAtlas().data ?? null;
  const layers = useMemo(
    () =>
      createVesselLayers(vessels, {
        id,
        atlas,
        selectedMmsi,
        ...(onSelect ? { onClick: onSelect } : {}),
        ...(iconSize ? { iconSize } : {}),
      }),
    [vessels, id, atlas, selectedMmsi, onSelect, iconSize],
  );
  const getTooltip = useCallback((info: PickingInfo) => vesselTooltip(info), []);
  useDeckLayers(id, layers, { order, getTooltip });
  return null;
}

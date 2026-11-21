import { COG_NOT_AVAILABLE, HEADING_NOT_AVAILABLE } from '@darmawanweb/ais-its-contracts/domain';
import type { Layer, PickingInfo } from '@deck.gl/core';
import { IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import { useCallback, useMemo } from 'react';

import type { VesselLiveRecord } from '@/shared/realtime/vessel-store';
import { type Rgba, SAFETY_COLORS } from '@/shared/theme/tokens';

import { useDeckLayers } from './hooks';
import type { MapTooltip } from './layer-registry';
import { useVesselIconAtlas, vesselIconName, type VesselIconAtlas } from './vessel-icons';

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
 * Ring colour of the safety state (spec §14: vessels coloured by safety state):
 * EWS danger > EWS warning > collision risk high > medium; null when normal.
 */
export function safetyRingColor(record: Pick<VesselLiveRecord, 'safety'>): Rgba | null {
  const safety = record.safety;
  if (!safety) return null;
  if (safety.ewsStatus === 0) return SAFETY_COLORS.ewsDanger;
  if (safety.ewsStatus === 1) return SAFETY_COLORS.ewsWarning;
  if (safety.collisionRisk === 'high') return SAFETY_COLORS.collisionHigh;
  if (safety.collisionRisk === 'medium') return SAFETY_COLORS.collisionMedium;
  return null;
}

export interface VesselLayerOptions {
  id?: string;
  atlas?: VesselIconAtlas | null;
  selectedMmsi?: number | null;
  onClick?: (record: VesselLiveRecord) => void;
  /** Icon size in pixels. */
  iconSize?: number;
}

/** deck.gl layers of live vessels: safety ring + rotated ship-type icon (dots until the atlas loads). */
export function createVesselLayers(
  records: readonly VesselLiveRecord[],
  options: VesselLayerOptions = {},
): Layer[] {
  const { id = 'vessels', atlas, selectedMmsi = null, onClick, iconSize = 22 } = options;
  const data = records as VesselLiveRecord[];
  const ringed = data.filter((record) => record.mmsi === selectedMmsi || safetyRingColor(record));
  const handleClick = (info: PickingInfo<VesselLiveRecord>) => {
    if (info.object) onClick?.(info.object);
    return !!info.object;
  };

  const ring = new ScatterplotLayer<VesselLiveRecord>({
    id: `${id}-ring`,
    data: ringed,
    getPosition: (record) => [record.lon, record.lat],
    radiusUnits: 'pixels',
    getRadius: (record) => (record.mmsi === selectedMmsi ? iconSize * 0.85 : iconSize * 0.7),
    stroked: true,
    filled: true,
    lineWidthUnits: 'pixels',
    getLineWidth: (record) => (record.mmsi === selectedMmsi ? 3 : 2),
    getLineColor: (record) =>
      record.mmsi === selectedMmsi
        ? SAFETY_COLORS.selected
        : (safetyRingColor(record) ?? SAFETY_COLORS.selected),
    getFillColor: (record) => {
      const color =
        record.mmsi === selectedMmsi
          ? SAFETY_COLORS.selected
          : (safetyRingColor(record) ?? SAFETY_COLORS.selected);
      return [color[0], color[1], color[2], 46];
    },
    updateTriggers: {
      getRadius: [selectedMmsi, iconSize],
      getLineWidth: selectedMmsi,
      getLineColor: selectedMmsi,
      getFillColor: selectedMmsi,
    },
  });

  const vessels = atlas
    ? new IconLayer<VesselLiveRecord>({
        id: `${id}-icons`,
        data,
        iconAtlas: atlas.url,
        iconMapping: atlas.mapping,
        getIcon: (record) => vesselIconName(record.vessel?.typeCode),
        getPosition: (record) => [record.lon, record.lat],
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
        getPosition: (record) => [record.lon, record.lat],
        radiusUnits: 'pixels',
        getRadius: 4,
        getFillColor: [56, 189, 248, 230],
        stroked: true,
        getLineColor: [7, 13, 23, 255],
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        pickable: true,
        onClick: handleClick,
      });

  return [ring, vessels];
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

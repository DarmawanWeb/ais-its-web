import { ScatterplotLayer } from '@deck.gl/layers';
import { useMemo } from 'react';

import { MapView, useDeckLayers } from '@/shared/map';
import { type Rgba, SAFETY_COLORS } from '@/shared/theme/tokens';

const SEVERITY_COLOR: Record<string, Rgba> = {
  critical: SAFETY_COLORS.ewsDanger,
  warning: SAFETY_COLORS.ewsWarning,
  info: SAFETY_COLORS.selected,
};

function LocationMarker({ lat, lon, severity }: { lat: number; lon: number; severity: string }) {
  const color = SEVERITY_COLOR[severity] ?? SAFETY_COLORS.selected;
  const layers = useMemo(() => {
    const data = [{ position: [lon, lat] as [number, number] }];
    return [
      new ScatterplotLayer<(typeof data)[number]>({
        id: 'alert-location-halo',
        data,
        getPosition: (d) => d.position,
        radiusUnits: 'pixels',
        getRadius: 18,
        filled: true,
        getFillColor: [color[0], color[1], color[2], 46],
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 2,
        getLineColor: [color[0], color[1], color[2], 230],
      }),
      new ScatterplotLayer<(typeof data)[number]>({
        id: 'alert-location',
        data,
        getPosition: (d) => d.position,
        radiusUnits: 'pixels',
        getRadius: 5,
        filled: true,
        getFillColor: color,
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 1.5,
        getLineColor: [255, 255, 255, 255],
      }),
    ];
  }, [lat, lon, color]);
  useDeckLayers('alert-location', layers, { order: 100 });
  return null;
}

/** Small map of an alert's location (lazy chunk: MapLibre + deck.gl). */
export function AlertMiniMap({
  lat,
  lon,
  severity,
  label,
}: {
  lat: number;
  lon: number;
  severity: string;
  label: string;
}) {
  return (
    <div className="h-48 overflow-hidden rounded-lg border" data-testid="alert-mini-map">
      <MapView
        initialCenter={[lon, lat]}
        initialZoom={10.5}
        showBasemapSwitcher={false}
        showScale={false}
        ariaLabel={label}
      >
        <LocationMarker lat={lat} lon={lon} severity={severity} />
      </MapView>
    </div>
  );
}

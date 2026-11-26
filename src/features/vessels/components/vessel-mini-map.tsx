import { MapView, VesselLayer } from '@/shared/map';
import type { VesselLiveRecord } from '@/shared/realtime';

/** Small live map centred on one vessel (lazy chunk: MapLibre + deck.gl). */
export function VesselMiniMap({ record, label }: { record: VesselLiveRecord; label: string }) {
  return (
    <div
      className="h-72 overflow-hidden rounded-xl border xl:h-full xl:min-h-72"
      data-testid="vessel-mini-map"
    >
      <MapView
        initialCenter={[record.lon, record.lat]}
        initialZoom={11}
        showBasemapSwitcher={false}
        ariaLabel={label}
      >
        <VesselLayer vessels={[record]} selectedMmsi={record.mmsi} id="vessel-detail" />
      </MapView>
    </div>
  );
}

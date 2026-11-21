import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MapPageLayout, MapView, VesselSafetyLegend } from '@/shared/map';
import type { VesselLiveRecord } from '@/shared/realtime/vessel-store';

import { LiveVessels } from '../components/live-vessels';
import { VesselQuickView } from '../components/vessel-quick-view';

/** Live map (scaffold): realtime vessels coloured by safety state, vessel quick view. */
export function LiveMapPage() {
  const { t } = useTranslation('map');
  const [selectedMmsi, setSelectedMmsi] = useState<number | null>(null);
  const select = useCallback((record: VesselLiveRecord) => setSelectedMmsi(record.mmsi), []);

  return (
    <MapPageLayout
      map={
        <MapView ariaLabel={t('title')}>
          <LiveVessels selectedMmsi={selectedMmsi} onSelect={select} />
        </MapView>
      }
      bottomLeft={<VesselSafetyLegend />}
      sidePanel={selectedMmsi !== null ? <VesselQuickView mmsi={selectedMmsi} /> : null}
      sidePanelTitle={t('vessel.title')}
      sidePanelOpen={selectedMmsi !== null}
      onSidePanelOpenChange={(open) => {
        if (!open) setSelectedMmsi(null);
      }}
    />
  );
}

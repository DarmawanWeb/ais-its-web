import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { CollisionRiskBadge, EwsStatusBadge, NavstatusLabel } from '@/shared/domain-ui/badges';
import { KeyValueList } from '@/shared/domain-ui/key-value-list';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { CoordinateText, MmsiText, UnitValue } from '@/shared/domain-ui/values';
import { formatRelativeTime } from '@/shared/lib/format';
import { useVesselLive } from '@/shared/realtime/hooks';
import { Button } from '@/shared/ui/button';

/** Live details of the selected vessel (vessel:<mmsi> room). */
export function VesselQuickView({ mmsi }: { mmsi: number }) {
  const { t, i18n } = useTranslation('map');
  const record = useVesselLive(mmsi);
  const position = record?.position;
  const safety = record?.safety;

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-1">
        <p className="text-base font-semibold">{record?.vessel?.name ?? t('vessel.unknownName')}</p>
        <MmsiText mmsi={mmsi} copyable className="text-sm text-muted-foreground" />
      </div>
      {!record ? (
        <p className="text-sm text-muted-foreground">{t('vessel.noData')}</p>
      ) : (
        <KeyValueList
          dense
          items={[
            {
              label: t('vessel.position'),
              value: <CoordinateText lat={record.lat} lon={record.lon} copyable />,
            },
            { label: t('vessel.sog'), value: <UnitValue value={position?.sog} unit="knots" /> },
            { label: t('vessel.cog'), value: <UnitValue value={position?.cog} unit="deg" /> },
            {
              label: t('vessel.navstatus'),
              hint: <MethodInfo methodId="navstatus.prediction" />,
              value: (
                <NavstatusLabel
                  code={position?.navstatus}
                  predicted={position?.predictedNavstatus ?? null}
                />
              ),
            },
            {
              label: t('vessel.ews'),
              hint: <MethodInfo methodId="ews.pipeline_distance_status" />,
              value: <EwsStatusBadge status={safety?.ewsStatus} />,
            },
            {
              label: t('vessel.collision'),
              hint: <MethodInfo methodId="collision.cpa_tcpa" />,
              value: <CollisionRiskBadge risk={safety?.collisionRisk} />,
            },
            {
              label: `${t('vessel.cpa')} / ${t('vessel.tcpa')}`,
              value: safety?.closestEncounter ? (
                <span className="inline-flex gap-2">
                  <UnitValue value={safety.closestEncounter.cpaNm} unit="nm" />
                  <UnitValue value={safety.closestEncounter.tcpaMin} unit="minutes" />
                </span>
              ) : (
                '—'
              ),
            },
            { label: t('vessel.source'), value: position?.source ?? '—' },
            {
              label: t('vessel.updated'),
              value: formatRelativeTime(record.updatedAt, i18n.language),
            },
          ]}
        />
      )}
      <Button variant="outline" size="sm" asChild className="w-full">
        <Link to={`/vessels/${mmsi}`}>
          {t('vessel.openVessel')} <ArrowUpRight />
        </Link>
      </Button>
    </div>
  );
}

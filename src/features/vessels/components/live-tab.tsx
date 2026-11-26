import {
  AIS_SOURCES,
  PREDICTED_NAV_STATUS_LABELS,
  type PredictedNavStatus,
} from '@darmawanweb/ais-its-contracts/domain';
import { Navigation, Radar, Route, ShieldAlert } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useVesselStatesControllerGet } from '@/shared/api/generated/safety/vessels/vessels';
import { usePermission } from '@/shared/auth/hooks';
import { CollisionRiskBadge, EwsStatusBadge, NavstatusLabel } from '@/shared/domain-ui/badges';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { KeyValueList } from '@/shared/domain-ui/key-value-list';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { Section } from '@/shared/domain-ui/section';
import { CoordinateText, MmsiText, UnitValue } from '@/shared/domain-ui/values';
import { formatDateTime } from '@/shared/lib/format';
import type { VesselLiveRecord } from '@/shared/realtime';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import { useAppLanguage } from '@/shared/i18n';
import { mapLinkOf } from '../lib/vessel';
import { LastSeen } from './last-seen';

const VesselMiniMap = lazy(() =>
  import('./vessel-mini-map').then((module) => ({ default: module.VesselMiniMap })),
);

function SafetySection({ mmsi, live }: { mmsi: number; live: VesselLiveRecord | undefined }) {
  const { t } = useTranslation('vessels');
  const state = useVesselStatesControllerGet(String(mmsi), {
    query: { retry: false, staleTime: 30_000 },
  });
  const ews = live?.safety?.ewsStatus ?? state.data?.ewsStatus ?? null;
  const risk = live?.safety?.collisionRisk ?? state.data?.collisionRisk ?? null;
  const encounter = live?.safety?.closestEncounter ?? state.data?.closestEncounter ?? null;
  return (
    <Section title={t('live.safety')} description={t('live.safetyDescription')}>
      {state.isPending && !live?.safety ? (
        <Skeleton className="h-24 w-full" />
      ) : ews === null && risk === null ? (
        <EmptyState
          icon={ShieldAlert}
          size="sm"
          title={t('live.noSafety')}
          description={t('live.noSafetyHint')}
        />
      ) : (
        <KeyValueList
          columns={2}
          items={[
            {
              key: 'ews',
              label: t('live.ews'),
              hint: <MethodInfo methodId="ews.pipeline_distance_status" />,
              value: <EwsStatusBadge status={ews} />,
            },
            {
              key: 'pipeline',
              label: t('live.pipelineDistance'),
              value: <UnitValue value={state.data?.pipelineDistanceM ?? null} unit="m" />,
            },
            {
              key: 'risk',
              label: t('live.collisionRisk'),
              hint: <MethodInfo methodId="collision.cpa_tcpa" />,
              value: <CollisionRiskBadge risk={risk} />,
            },
            {
              key: 'encounter',
              label: t('live.closestEncounter'),
              value: encounter ? (
                <span className="inline-flex flex-wrap items-center gap-x-2">
                  <Link
                    to={`/vessels/${encounter.otherMmsi}`}
                    className="text-primary hover:underline"
                  >
                    <MmsiText mmsi={encounter.otherMmsi} />
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {t('live.cpa')} <UnitValue value={encounter.cpaNm} unit="nm" /> ·{' '}
                    {t('live.tcpa')}{' '}
                    <UnitValue value={encounter.tcpaMin} unit="minutes" digits={1} />
                  </span>
                </span>
              ) : (
                '—'
              ),
            },
          ]}
        />
      )}
    </Section>
  );
}

/** Live tab: latest AIS position (realtime room `vessel:<mmsi>`), safety state, mini map. */
export function LiveTab({
  mmsi,
  name,
  live,
}: {
  mmsi: number;
  name: string;
  live: VesselLiveRecord | undefined;
}) {
  const { t, i18n } = useTranslation('vessels');
  const locale = useAppLanguage();
  const canReadSafety = usePermission('safety:read');
  const position = live?.position ?? null;
  if (!live) {
    return (
      <Section title={t('live.position')}>
        <EmptyState
          icon={Radar}
          title={t('live.noPosition')}
          description={t('live.noPositionHint')}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to={mapLinkOf(mmsi)}>
                <Route /> {t('live.openMap')}
              </Link>
            </Button>
          }
        />
      </Section>
    );
  }
  const predicted: PredictedNavStatus | null = position?.predictedNavstatus ?? null;
  const heading = position && position.hdg !== 511 ? position.hdg : null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-6">
        <Section title={t('live.position')} actions={<LastSeen time={position?.time ?? null} />}>
          <KeyValueList
            columns={2}
            items={[
              {
                key: 'position',
                label: t('live.coordinates'),
                value: <CoordinateText lat={live.lat} lon={live.lon} copyable />,
              },
              {
                key: 'time',
                label: t('live.positionTime'),
                value: position
                  ? formatDateTime(position.time, i18n.language, 'dd MMM yyyy HH:mm:ss')
                  : '—',
              },
              {
                key: 'sog',
                label: t('live.sog'),
                value: <UnitValue value={position?.sog ?? null} unit="knots" />,
              },
              {
                key: 'cog',
                label: t('live.cog'),
                value: <UnitValue value={position?.cog ?? null} unit="deg" />,
              },
              {
                key: 'hdg',
                label: t('live.heading'),
                value:
                  heading === null ? t('live.headingNa') : <UnitValue value={heading} unit="deg" />,
              },
              {
                key: 'navstatus',
                label: t('live.navstatus'),
                value: <NavstatusLabel code={position?.navstatus ?? null} />,
              },
              {
                key: 'predicted',
                label: t('live.predicted'),
                hint: <MethodInfo methodId="navstatus.prediction" />,
                value: predicted === null ? '—' : PREDICTED_NAV_STATUS_LABELS[predicted][locale],
              },
              {
                key: 'source',
                label: t('live.source'),
                value:
                  position && (AIS_SOURCES as readonly string[]).includes(position.source)
                    ? t(`live.sources.${position.source}`)
                    : '—',
              },
            ]}
          />
        </Section>
        {canReadSafety && <SafetySection mmsi={mmsi} live={live} />}
      </div>
      <Section
        title={t('live.map')}
        contentClassName="flex flex-1 flex-col"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={mapLinkOf(mmsi, live)}>
              <Navigation /> {t('live.track')}
            </Link>
          </Button>
        }
      >
        <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl xl:h-full" />}>
          <VesselMiniMap record={live} label={t('live.mapLabel', { name })} />
        </Suspense>
      </Section>
    </div>
  );
}

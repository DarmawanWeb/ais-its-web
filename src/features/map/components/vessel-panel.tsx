import { ALERT_STATUS_LABELS, isNavStatus } from '@darmawanweb/ais-its-contracts/domain';
import { ArrowUpRight, BellRing, Cable, Gauge, Leaf, Radar, Ship } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useAlertsControllerList } from '@/shared/api/generated/notification/alerts/alerts';
import { useVesselsControllerGetByMmsi } from '@/shared/api/generated/fleet/vessels/vessels';
import { useZonesControllerGet } from '@/shared/api/generated/geo/zones/zones';
import { useVesselStatesControllerGet } from '@/shared/api/generated/safety/vessels/vessels';
import { isApiProblem } from '@/shared/api/problem';
import { useCanAccessOrg, usePermission } from '@/shared/auth/hooks';
import {
  CollisionRiskBadge,
  EwsStatusBadge,
  NavstatusLabel,
  SeverityBadge,
} from '@/shared/domain-ui/badges';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { CoordinateText, MmsiText, UnitValue } from '@/shared/domain-ui/values';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { realtime } from '@/shared/realtime/client';
import { useVesselLive } from '@/shared/realtime/hooks';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import { vesselCategory } from '../lib/vessel-filters';
import { TrackControls } from './track-controls';

function SectionTitle({
  id,
  icon: Icon,
  children,
}: {
  id: string;
  icon: typeof Ship;
  children: ReactNode;
}) {
  return (
    <h2
      id={id}
      className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
    >
      <Icon className="size-3.5" aria-hidden /> {children}
    </h2>
  );
}

function Fact({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 rounded-lg border bg-background/40 px-2.5 py-2', className)}>
      <dt className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
        {label}
        {hint}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

/** Name the live store knows for an MMSI (vessels seen by this tab). */
function knownName(mmsi: number): string | null {
  return realtime.vessels.get(mmsi)?.vessel?.name ?? null;
}

/**
 * Vessel panel of the live map: identity (fleet registry when the vessel is in the fleet),
 * live kinematics (`vessel:<mmsi>` room), safety state with the nearest pipeline and the
 * closest encounter, recent alerts, links, and the track history with playback.
 */
export function VesselPanel({ mmsi }: { mmsi: number }) {
  const { t, i18n } = useTranslation('map');
  const record = useVesselLive(mmsi);
  const canSafety = usePermission('safety:read');
  const canAlerts = usePermission('alert:read');
  const canZones = usePermission('zone:read');
  const canCii = usePermission('cii:read');
  const fleet = useVesselsControllerGetByMmsi(String(mmsi), {
    query: { staleTime: 5 * 60_000, retry: false },
  });
  const state = useVesselStatesControllerGet(String(mmsi), {
    query: { enabled: canSafety, refetchInterval: 30_000, retry: false },
  });
  const zoneId = state.data?.nearestPipelineZoneId ?? null;
  // Safety 0.2 names the pipeline in the state (same tenancy rule as the distance); the zone
  // lookup is only the fallback for states without it.
  const pipelineName = state.data?.nearestPipeline?.name ?? null;
  const zone = useZonesControllerGet(zoneId ?? '', {
    query: {
      enabled: canZones && !!zoneId && !pipelineName,
      staleTime: 10 * 60_000,
      retry: false,
    },
  });
  const alerts = useAlertsControllerList(
    { mmsi, limit: 5 },
    { query: { enabled: canAlerts, staleTime: 30_000 } },
  );
  const vessel = fleet.data;
  const ownOrg = useCanAccessOrg(vessel && 'orgId' in vessel ? vessel.orgId : null);
  const notInFleet = fleet.isError && isApiProblem(fleet.error) && fleet.error.status === 404;
  const position = record?.position;
  const safety = record?.safety;
  const encounter = safety?.closestEncounter ?? state.data?.closestEncounter ?? null;
  const name = vessel?.name ?? record?.vessel?.name ?? null;
  const category = vesselCategory(
    record ?? { vessel: vessel ? { typeCode: vessel.type.code } : null },
  );

  return (
    <div className="space-y-5 p-4" data-testid="vessel-panel">
      <header className="space-y-2">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Ship className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold" data-testid="vessel-panel-name">
              {name ?? t('vessel.unknownName')}
            </p>
            <MmsiText mmsi={mmsi} copyable className="text-sm text-muted-foreground" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="muted">{vessel?.type.name ?? t(`categories.${category}`)}</Badge>
          {vessel?.flag && (
            <Badge variant="outline">{t('vessel.flag', { flag: vessel.flag })}</Badge>
          )}
          {vessel?.imo && <Badge variant="outline">IMO {vessel.imo}</Badge>}
          {vessel && vessel.view === 'detail' && ownOrg && (
            <Badge variant="primary">{t('vessel.ownFleet')}</Badge>
          )}
          {notInFleet && <Badge variant="muted">{t('vessel.notInFleet')}</Badge>}
          {position?.source && <Badge variant="outline">{t(`sources.${position.source}`)}</Badge>}
        </div>
      </header>

      <section aria-labelledby="vessel-kinematics" className="space-y-2">
        <SectionTitle id="vessel-kinematics" icon={Gauge}>
          {t('vessel.kinematics')}
        </SectionTitle>
        {!record ? (
          <div className="space-y-2" aria-busy>
            <Skeleton className="h-14 w-full" />
            <p className="text-xs text-muted-foreground">{t('vessel.noData')}</p>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-2">
            <Fact label={t('vessel.position')} className="col-span-2">
              <CoordinateText lat={record.lat} lon={record.lon} copyable />
            </Fact>
            <Fact label={t('vessel.sog')}>
              <UnitValue
                value={position && position.sog < 102.3 ? position.sog : null}
                unit="knots"
              />
            </Fact>
            <Fact label={t('vessel.cog')}>
              <UnitValue value={position && position.cog < 360 ? position.cog : null} unit="deg" />
            </Fact>
            <Fact label={t('vessel.heading')}>
              <UnitValue value={position && position.hdg < 360 ? position.hdg : null} unit="deg" />
            </Fact>
            <Fact label={t('vessel.updated')}>
              <time
                dateTime={new Date(record.updatedAt).toISOString()}
                title={formatDateTime(record.updatedAt, i18n.language, 'dd MMM yyyy HH:mm:ss')}
              >
                {formatRelativeTime(record.updatedAt, i18n.language)}
              </time>
            </Fact>
            <Fact
              label={t('vessel.navstatus')}
              hint={<MethodInfo methodId="navstatus.prediction" />}
              className="col-span-2"
            >
              <NavstatusLabel
                code={position && isNavStatus(position.navstatus) ? position.navstatus : null}
                predicted={position?.predictedNavstatus ?? null}
                showCode
              />
            </Fact>
          </dl>
        )}
      </section>

      {canSafety && (
        <section aria-labelledby="vessel-safety" className="space-y-2">
          <SectionTitle id="vessel-safety" icon={Cable}>
            {t('vessel.safety')}
          </SectionTitle>
          <dl className="grid grid-cols-2 gap-2">
            <Fact
              label={t('vessel.ews')}
              hint={<MethodInfo methodId="ews.pipeline_distance_status" />}
            >
              <EwsStatusBadge status={safety?.ewsStatus ?? state.data?.ewsStatus ?? null} />
            </Fact>
            <Fact
              label={t('vessel.pipelineDistance')}
              hint={<MethodInfo methodId="ews.pipeline_distance_status" />}
            >
              {state.isPending ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                <UnitValue value={state.data?.pipelineDistanceM ?? null} unit="m" />
              )}
            </Fact>
            <Fact label={t('vessel.nearestPipeline')} className="col-span-2">
              {zoneId ? (
                (pipelineName ??
                zone.data?.name ??
                (zone.isPending && canZones ? (
                  <Skeleton className="h-4 w-32" />
                ) : (
                  t('vessel.pipelineHidden')
                )))
              ) : (
                <span className="text-muted-foreground">
                  {state.data ? t('vessel.noPipeline') : '—'}
                </span>
              )}
            </Fact>
            <Fact label={t('vessel.collision')} hint={<MethodInfo methodId="collision.cpa_tcpa" />}>
              <CollisionRiskBadge
                risk={safety?.collisionRisk ?? state.data?.collisionRisk ?? null}
              />
            </Fact>
            <Fact label={t('vessel.closestEncounter')}>
              {encounter ? (
                <span className="truncate">
                  {knownName(encounter.otherMmsi) ?? encounter.otherMmsi}
                </span>
              ) : (
                <span className="text-muted-foreground">{t('vessel.noEncounter')}</span>
              )}
            </Fact>
            {encounter && (
              <>
                <Fact label="CPA" hint={<MethodInfo methodId="collision.cpa_tcpa" />}>
                  <UnitValue value={encounter.cpaNm} unit="nm" />
                </Fact>
                <Fact label="TCPA" hint={<MethodInfo methodId="collision.cpa_tcpa" />}>
                  <UnitValue value={encounter.tcpaMin} unit="minutes" digits={1} />
                </Fact>
              </>
            )}
          </dl>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="ghost" size="xs" asChild>
              <Link to={`/safety/ews?status=0,1,3&vessel=${mmsi}`}>
                <Cable /> {t('vessel.openEws')}
              </Link>
            </Button>
            <Button variant="ghost" size="xs" asChild>
              <Link to={`/safety/collision?mmsi=${mmsi}&range=7d`}>
                <Radar /> {t('vessel.openCollision')}
              </Link>
            </Button>
          </div>
        </section>
      )}

      {canAlerts && (
        <section aria-labelledby="vessel-alerts" className="space-y-2">
          <SectionTitle id="vessel-alerts" icon={BellRing}>
            {t('vessel.alerts')}
          </SectionTitle>
          {alerts.isPending ? (
            <Skeleton className="h-12 w-full" />
          ) : alerts.isError || alerts.data.data.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
              {alerts.isError ? t('vessel.alertsUnavailable') : t('vessel.noAlerts')}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {alerts.data.data.map((alert) => (
                <li key={alert.id}>
                  <Link
                    to={`/alerts?alert=${alert.id}&status=all`}
                    className="flex items-start gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <SeverityBadge severity={alert.severity} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 font-medium">{alert.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(alert.lastOccurredAt, i18n.language)} ·{' '}
                        {alert.status in ALERT_STATUS_LABELS
                          ? ALERT_STATUS_LABELS[alert.status][i18n.language === 'en' ? 'en' : 'id']
                          : alert.status}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <TrackControls />

      <nav
        aria-label={t('vessel.links')}
        className="grid grid-cols-1 gap-2 border-t pt-4 sm:grid-cols-2"
      >
        <Button variant="outline" size="sm" asChild>
          <Link to={`/vessels/${mmsi}`}>
            <Ship /> {t('vessel.openVessel')} <ArrowUpRight className="ml-auto" />
          </Link>
        </Button>
        {canCii && vessel?.view === 'detail' && ownOrg && (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/cii?mmsi=${mmsi}`}>
              <Leaf /> {t('vessel.openCii')} <ArrowUpRight className="ml-auto" />
            </Link>
          </Button>
        )}
        {canAlerts && (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/alerts?mmsi=${mmsi}&status=all`}>
              <BellRing /> {t('vessel.openAlerts')} <ArrowUpRight className="ml-auto" />
            </Link>
          </Button>
        )}
      </nav>
    </div>
  );
}

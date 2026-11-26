import { ArrowLeft, Bell, Fuel, Leaf, Map as MapIcon, Pencil, Radar, Ship } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { Can } from '@/shared/auth/guards';
import { useCanAccessOrg, usePermission, useSession } from '@/shared/auth/hooks';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { useVesselLive } from '@/shared/realtime';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import { useVesselByMmsi } from '../api/vessels';
import { AlertsTab } from '../components/alerts-tab';
import { CiiTab } from '../components/cii-tab';
import { DeleteVesselButton } from '../components/delete-vessel-button';
import { LiveTab } from '../components/live-tab';
import { OverviewTab } from '../components/overview-tab';
import { TelemetryTab } from '../components/telemetry-tab';
import { VesselHero } from '../components/vessel-hero';
import { localizeProblem } from '@/shared/api/problem-copy';
import { fleetProblemCopies } from '../lib/problems';
import { isDetailView, mapLinkOf, parseMmsiParam } from '../lib/vessel';

const TABS = ['overview', 'live', 'cii', 'telemetry', 'alerts'] as const;
type TabId = (typeof TABS)[number];

function BackLink() {
  const { t } = useTranslation('vessels');
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
      <Link to="/vessels">
        <ArrowLeft /> {t('detail.back')}
      </Link>
    </Button>
  );
}

/** Vessel page (`/vessels/:mmsi`): identity, live position, CII, telemetry and alerts. */
export function DetailPage() {
  const { t } = useTranslation('vessels');
  const navigate = useNavigate();
  const params = useParams<{ mmsi: string }>();
  const mmsi = parseMmsiParam(params.mmsi);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useVesselByMmsi(mmsi);
  const live = useVesselLive(mmsi);
  const vessel = query.data;
  const detail = isDetailView(vessel) ? vessel : null;
  const { orgId: activeOrgId } = useSession();
  const owned = useCanAccessOrg(detail ? detail.orgId : undefined) && detail !== null;
  const ownership = !detail ? 'other' : detail.orgId === activeOrgId ? 'own' : 'platform';
  const canWrite = usePermission('vessel:write');
  const permitted: Record<TabId, boolean> = {
    overview: true,
    live: usePermission('ais:read'),
    cii: usePermission('cii:read') && owned,
    telemetry: usePermission('telemetry:read') && owned,
    alerts: usePermission('alert:read'),
  };
  const requested = searchParams.get('tab') as TabId | null;
  const tab: TabId =
    requested && TABS.includes(requested) && permitted[requested] ? requested : 'overview';

  if (mmsi === null) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <h1 className="sr-only">{t('detail.title')}</h1>
        <EmptyState
          icon={Ship}
          title={t('detail.invalidMmsi')}
          description={t('detail.invalidMmsiHint')}
        />
      </div>
    );
  }
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <BackLink />
        <h1 className="sr-only">{t('detail.title')}</h1>
        <Skeleton className="h-60 w-full rounded-2xl" />
        <Skeleton className="h-9 w-96 max-w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (query.error || !vessel) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <h1 className="sr-only">{t('detail.title')}</h1>
        <div className="rounded-xl border bg-surface">
          <ErrorState
            error={localizeProblem(query.error, fleetProblemCopies(t))}
            onRetry={() => void query.refetch()}
          />
        </div>
      </div>
    );
  }

  const tabMeta: { id: TabId; label: string; icon: typeof Ship }[] = [
    { id: 'overview', label: t('tabs.overview'), icon: Ship },
    { id: 'live', label: t('tabs.live'), icon: Radar },
    { id: 'cii', label: t('tabs.cii'), icon: Leaf },
    { id: 'telemetry', label: t('tabs.telemetry'), icon: Fuel },
    { id: 'alerts', label: t('tabs.alerts'), icon: Bell },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <BackLink />
      <VesselHero
        vessel={vessel}
        live={live}
        ownership={ownership}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to={mapLinkOf(vessel.mmsi, live)}>
                <MapIcon /> {t('detail.showOnMap')}
              </Link>
            </Button>
            {detail && owned && canWrite && (
              <>
                <Can permission="vessel:write">
                  <Button asChild size="sm">
                    <Link to={`/vessels/${vessel.mmsi}/edit`}>
                      <Pencil /> {t('actions.edit')}
                    </Link>
                  </Button>
                </Can>
                <DeleteVesselButton vessel={detail} onDeleted={() => void navigate('/vessels')} />
              </>
            )}
          </>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) =>
          setSearchParams(
            (current) => {
              const next = new URLSearchParams(current);
              if (value === 'overview') next.delete('tab');
              else next.set('tab', value);
              return next;
            },
            { replace: true },
          )
        }
        className="gap-5"
      >
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList aria-label={t('tabs.label')}>
            {tabMeta
              .filter((item) => permitted[item.id])
              .map((item) => (
                <TabsTrigger key={item.id} value={item.id}>
                  <item.icon aria-hidden /> {item.label}
                </TabsTrigger>
              ))}
          </TabsList>
        </div>
        <TabsContent value="overview" className="min-w-0">
          <OverviewTab vessel={vessel} />
        </TabsContent>
        {permitted.live && (
          <TabsContent value="live" className="min-w-0">
            <LiveTab mmsi={vessel.mmsi} name={vessel.name} live={live} />
          </TabsContent>
        )}
        {permitted.cii && (
          <TabsContent value="cii" className="min-w-0">
            <CiiTab mmsi={vessel.mmsi} />
          </TabsContent>
        )}
        {permitted.telemetry && (
          <TabsContent value="telemetry" className="min-w-0">
            <TelemetryTab mmsi={vessel.mmsi} />
          </TabsContent>
        )}
        {permitted.alerts && (
          <TabsContent value="alerts" className="min-w-0">
            <AlertsTab mmsi={vessel.mmsi} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

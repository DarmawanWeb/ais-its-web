import { BellRing, MapPin } from 'lucide-react';
import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { EncounterDto } from '@/shared/api/generated/safety/model';
import { CollisionRiskBadge } from '@/shared/domain-ui/badges';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { MmsiText, UnitValue } from '@/shared/domain-ui/values';
import { formatDateTime, formatNumber } from '@/shared/lib/format';
import { rgbaToCss } from '@/shared/theme/tokens';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';

import { VESSEL_A_COLOR, VESSEL_B_COLOR, withAlpha } from '../lib/colors';
import {
  closestSample,
  encounterChartData,
  encounterDurationMin,
  isEncounterActive,
} from '../lib/encounters';
import type { CollisionThresholds } from '../lib/thresholds';
import { EncounterChart } from './encounter-chart';
import { RiskBandLegend } from './risk-band-legend';

const EncounterMap = lazy(() =>
  import('./encounter-map').then((module) => ({ default: module.EncounterMap })),
);

type Risk = 'none' | 'low' | 'medium' | 'high';
const asRisk = (value: string): Risk | null =>
  value === 'none' || value === 'low' || value === 'medium' || value === 'high' ? value : null;

function Kpi({
  label,
  children,
  methodId,
}: {
  label: string;
  children: React.ReactNode;
  methodId?: string;
}) {
  return (
    <div className="rounded-lg border bg-background/40 px-3 py-2.5">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {methodId && <MethodInfo methodId={methodId} />}
      </dt>
      <dd className="mt-1 text-base font-semibold">{children}</dd>
    </div>
  );
}

/** Detail of a collision encounter: KPIs, CPA/TCPA history, both tracks, risk bands. */
export function EncounterDetailSheet({
  encounter,
  loading,
  names,
  thresholds,
  onOpenChange,
  open,
}: {
  encounter: EncounterDto | null;
  loading: boolean;
  names: ReadonlyMap<number, string>;
  thresholds: CollisionThresholds;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation('safety');
  const chart = useMemo(
    () => (encounter ? encounterChartData(encounter.history) : []),
    [encounter],
  );
  const closest = encounter ? closestSample(encounter) : null;
  const name = (mmsi: number) => names.get(mmsi);
  const peak = encounter ? asRisk(encounter.peakRisk) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl"
        closeLabel={t('common:actions.close')}
        data-testid="encounter-detail"
      >
        <SheetHeader className="gap-2 border-b px-4 py-5 sm:px-6">
          {encounter ? (
            <>
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <CollisionRiskBadge risk={peak} />
                {isEncounterActive(encounter) ? (
                  <Badge variant="danger" className="gap-1">
                    <span className="size-1.5 animate-pulse rounded-full bg-danger" aria-hidden />
                    {t('collision.table.active')}
                  </Badge>
                ) : (
                  <Badge variant="muted">{t('collision.table.ended')}</Badge>
                )}
              </div>
              <SheetTitle className="text-lg leading-snug">
                {t('collision.detail.title', {
                  a: name(encounter.mmsiA) ?? encounter.mmsiA,
                  b: name(encounter.mmsiB) ?? encounter.mmsiB,
                })}
              </SheetTitle>
              <SheetDescription>
                {t('collision.detail.window', {
                  from: formatDateTime(encounter.startedAt, i18n.language, 'dd MMM yyyy HH:mm'),
                  to: formatDateTime(encounter.lastSampleAt, i18n.language, 'HH:mm'),
                })}
              </SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle>{t('collision.detail.loadingTitle')}</SheetTitle>
              <SheetDescription className="sr-only">
                {t('collision.detail.loadingTitle')}
              </SheetDescription>
            </>
          )}
        </SheetHeader>
        {!encounter ? (
          <div className="space-y-3 p-6" aria-busy={loading}>
            {loading ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-44 w-full" />
                <Skeleton className="h-64 w-full" />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t('collision.detail.notFound')}</p>
            )}
          </div>
        ) : (
          <div className="space-y-6 px-4 py-5 sm:px-6">
            <div className="flex flex-wrap gap-2">
              {(['mmsiA', 'mmsiB'] as const).map((key, index) => (
                <div
                  key={key}
                  className="flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{
                    borderColor: rgbaToCss(
                      withAlpha(index === 0 ? VESSEL_A_COLOR : VESSEL_B_COLOR, 110),
                    ),
                  }}
                >
                  <span
                    aria-hidden
                    className="flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-black"
                    style={{
                      backgroundColor: rgbaToCss(index === 0 ? VESSEL_A_COLOR : VESSEL_B_COLOR),
                    }}
                  >
                    {index === 0 ? 'A' : 'B'}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {name(encounter[key]) ?? '—'}
                    </span>
                    <MmsiText
                      mmsi={encounter[key]}
                      copyable
                      className="text-xs text-muted-foreground"
                    />
                  </span>
                  <Button variant="ghost" size="icon-xs" asChild>
                    <Link
                      to={`/map?vessel=${encounter[key]}`}
                      aria-label={t('collision.detail.openOnMap', { mmsi: encounter[key] })}
                      title={t('collision.detail.openOnMapShort')}
                    >
                      <MapPin />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label={t('collision.detail.minCpa')} methodId="collision.cpa_tcpa">
                <UnitValue value={encounter.minCpaNm} unit="nm" />
              </Kpi>
              <Kpi label={t('collision.detail.tcpaAtMin')} methodId="collision.cpa_tcpa">
                <UnitValue value={closest?.tcpaMin ?? null} unit="minutes" digits={1} />
              </Kpi>
              <Kpi label={t('collision.detail.rangeAtMin')}>
                <UnitValue value={closest?.rangeNm ?? null} unit="nm" />
              </Kpi>
              <Kpi label={t('collision.detail.duration')}>
                <UnitValue value={encounterDurationMin(encounter)} unit="minutes" />
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {t('collision.detail.sampleCount', { count: encounter.history.length })}
                </span>
              </Kpi>
            </dl>

            <section aria-labelledby="encounter-history-title" className="space-y-3">
              <h3 id="encounter-history-title" className="text-sm font-semibold">
                {t('collision.detail.history')}
              </h3>
              {chart.length > 1 ? (
                <EncounterChart data={chart} thresholds={thresholds} />
              ) : (
                <p className="text-sm text-muted-foreground">{t('collision.detail.fewSamples')}</p>
              )}
              <details className="group rounded-lg border">
                <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                  {t('collision.detail.showSamples', { count: encounter.history.length })}
                </summary>
                {/* Focusable so keyboard users can scroll the samples. */}
                <div
                  className="max-h-64 overflow-auto border-t focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region (axe scrollable-region-focusable)
                  tabIndex={0}
                  role="region"
                  aria-label={t('collision.detail.samplesCaption')}
                >
                  <table className="w-full text-xs">
                    <caption className="sr-only">{t('collision.detail.samplesCaption')}</caption>
                    <thead className="sticky top-0 bg-muted/90 text-left text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-3 py-1.5 font-medium">
                          {t('collision.detail.time')}
                        </th>
                        <th scope="col" className="px-3 py-1.5 text-right font-medium">
                          CPA
                        </th>
                        <th scope="col" className="px-3 py-1.5 text-right font-medium">
                          TCPA
                        </th>
                        <th scope="col" className="px-3 py-1.5 text-right font-medium">
                          {t('collision.detail.range')}
                        </th>
                        <th scope="col" className="px-3 py-1.5 font-medium">
                          {t('collision.detail.band')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {encounter.history.map((sample) => (
                        <tr key={sample.time}>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            {formatDateTime(sample.time, i18n.language, 'HH:mm:ss')}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                            {formatNumber(sample.cpaNm, i18n.language, {
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                            {sample.tcpaMin === null
                              ? '—'
                              : formatNumber(sample.tcpaMin, i18n.language, {
                                  maximumFractionDigits: 1,
                                })}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                            {formatNumber(sample.rangeNm, i18n.language, {
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-3 py-1.5">
                            <CollisionRiskBadge risk={asRisk(sample.risk)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>

            <section aria-labelledby="encounter-map-title" className="space-y-3">
              <h3 id="encounter-map-title" className="text-sm font-semibold">
                {t('collision.detail.tracks')}
              </h3>
              <Suspense fallback={<Skeleton className="h-72 w-full rounded-lg" />}>
                <EncounterMap
                  encounter={encounter}
                  className="h-72 overflow-hidden rounded-lg border"
                />
              </Suspense>
            </section>

            <RiskBandLegend thresholds={thresholds} compact />

            <Button variant="outline" size="sm" asChild>
              <Link to={`/alerts?type=collision&mmsi=${encounter.mmsiA}&status=all`}>
                <BellRing /> {t('collision.detail.relatedAlerts')}
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

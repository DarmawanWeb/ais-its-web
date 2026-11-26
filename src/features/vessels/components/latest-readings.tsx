import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { FuelSeriesPointDtoSource } from '@/shared/api/generated/telemetry/model';
import { useReadingsControllerSeries } from '@/shared/api/generated/telemetry/readings/readings';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { Section } from '@/shared/domain-ui/section';
import { formatDateTime, formatNumber } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

import { latestReadingsWindow } from '../lib/telemetry';

/** Number of raw readings listed in the vessel's telemetry tab. */
export const LATEST_READINGS = 8;

/**
 * The newest raw fuel readings of a vessel. The readings API pages ascending only, so the list
 * reads the raw series of the hours before the newest reading and keeps the last ones.
 */
export function LatestReadings({
  mmsi,
  lastReadingAt,
}: {
  mmsi: number;
  lastReadingAt: string | null;
}) {
  const { t, i18n } = useTranslation('vessels');
  const window = latestReadingsWindow(lastReadingAt);
  const readings = useReadingsControllerSeries(
    String(mmsi),
    { from: window?.from ?? '', to: window?.to ?? '', bucket: 'raw', limit: 500 },
    { query: { enabled: window !== null, staleTime: 30_000 } },
  );
  const rows = (readings.data?.data ?? []).slice(-LATEST_READINGS).reverse();
  const n = (value: number) =>
    formatNumber(value, i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  return (
    <Section title={t('telemetry.latestTitle')} description={t('telemetry.latestDescription')}>
      {window === null ? (
        <EmptyState
          icon={History}
          size="sm"
          title={t('telemetry.empty')}
          description={t('telemetry.emptyHint')}
        />
      ) : readings.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : readings.error ? (
        <ErrorState error={readings.error} onRetry={() => void readings.refetch()} size="sm" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table aria-label={t('telemetry.latestTitle')}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('telemetry.columns.time')}</TableHead>
                <TableHead className="text-right">{t('telemetry.columns.me')}</TableHead>
                <TableHead className="text-right">{t('telemetry.columns.ae')}</TableHead>
                <TableHead className="text-right">{t('telemetry.columns.total')}</TableHead>
                <TableHead>{t('telemetry.columns.source')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((reading) => (
                <TableRow key={reading.time}>
                  <TableCell className="font-mono text-xs whitespace-nowrap tabular-nums">
                    {formatDateTime(reading.time, i18n.language, 'dd MMM HH:mm:ss')}
                    {reading.periodStart && (
                      <span className="block font-sans text-[11px] text-muted-foreground">
                        {t('telemetry.since', {
                          time: formatDateTime(reading.periodStart, i18n.language, 'HH:mm'),
                        })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {n(reading.fuelMeTon)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {n(reading.fuelAeTon)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium tabular-nums">
                    {n(reading.totalFuelTon)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="muted">{sourceLabel(t, reading.source)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

function sourceLabel(
  t: (key: string) => string,
  source: FuelSeriesPointDtoSource | null | undefined,
): string {
  return source ? t(`telemetry.sources.${source}`) : '—';
}

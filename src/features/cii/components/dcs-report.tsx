import { Download, FileSpreadsheet, Info } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toApiProblem } from '@/shared/api/problem';
import { KeyValueList } from '@/shared/domain-ui/key-value-list';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { Section } from '@/shared/domain-ui/section';
import { UnitValue } from '@/shared/domain-ui/values';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';
import { Spinner } from '@/shared/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

import { downloadDcsCsv, useDcsSummary } from '../api/queries';
import { useCiiFormat } from '../hooks/use-cii-format';
import { ciiProblemKey } from '../lib/problems';
import { CiiProblemState, MethodChips, SourceBadge } from './bits';

/** IMO DCS-style annual summary (fuel per type, distance, hours under way, CO2) with CSV export. */
export function DcsReport({ mmsi, year }: { mmsi: number; year: number }) {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  const query = useDcsSummary(mmsi, year);
  const [downloading, setDownloading] = useState(false);
  const dcs = query.data;

  const download = async () => {
    setDownloading(true);
    try {
      await downloadDcsCsv(mmsi, year);
      toast.success(t('dcs.downloaded', { year }));
    } catch (error) {
      const key = ciiProblemKey(toApiProblem(error));
      toast.error(key ? t(`problems.${key}.title`, { year }) : t('dcs.downloadFailed'));
    } finally {
      setDownloading(false);
    }
  };

  const totals = dcs?.fuel.reduce(
    (sum, line) => ({
      me: sum.me + line.fuelMeTon,
      ae: sum.ae + line.fuelAeTon,
      total: sum.total + line.totalTon,
      co2: sum.co2 + line.co2Ton,
    }),
    { me: 0, ae: 0, total: 0, co2: 0 },
  );

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1">
          {t('dcs.title', { year })} <MethodInfo methodId="emission.dcs_summary" />
        </span>
      }
      description={t('dcs.description')}
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => void download()}
          disabled={downloading || !dcs}
        >
          {downloading ? <Spinner /> : <Download />} {t('dcs.downloadCsv')}
        </Button>
      }
      className="min-w-0"
      contentClassName="min-w-0"
    >
      {query.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : query.isError ? (
        <CiiProblemState
          error={query.error}
          onRetry={() => void query.refetch()}
          values={{ year }}
        />
      ) : dcs ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet className="size-4 text-primary" aria-hidden />
            <span className="font-medium">{dcs.vesselName}</span>
            <span className="font-mono text-xs text-muted-foreground">
              MMSI {dcs.mmsi}
              {dcs.imo ? ` · IMO ${dcs.imo}` : ''}
            </span>
            <SourceBadge source={dcs.source} />
          </div>
          <KeyValueList
            columns={3}
            items={[
              {
                key: 'distance',
                label: t('dcs.distance'),
                value: <UnitValue value={dcs.distanceNm} unit="nm" digits={1} />,
              },
              {
                key: 'hours',
                label: t('dcs.hoursUnderWay'),
                value:
                  dcs.hoursUnderWay === null ? (
                    <span className="text-muted-foreground">{t('dcs.hoursUnknown')}</span>
                  ) : (
                    <span className="font-mono tabular-nums">
                      {format.number(dcs.hoursUnderWay, 1)} {t('dcs.hours')}
                    </span>
                  ),
              },
              {
                key: 'co2',
                label: t('dcs.co2'),
                value: <UnitValue value={dcs.co2Ton} unit="tonnes" />,
                hint: <MethodInfo methodId="emission.co2_conversion" />,
              },
            ]}
          />
          <div className="overflow-x-auto rounded-lg border">
            <Table aria-label={t('dcs.tableLabel', { year })}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('dcs.fuel')}</TableHead>
                  <TableHead className="text-right">{t('dcs.conversionFactor')}</TableHead>
                  <TableHead className="text-right">{t('dcs.fuelMe')}</TableHead>
                  <TableHead className="text-right">{t('dcs.fuelAe')}</TableHead>
                  <TableHead className="text-right">{t('dcs.fuelTotal')}</TableHead>
                  <TableHead className="text-right">{t('dcs.co2')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dcs.fuel.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={6}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      {t('dcs.noFuel')}
                    </TableCell>
                  </TableRow>
                ) : (
                  dcs.fuel.map((line) => (
                    <TableRow key={line.fuelCode}>
                      <TableCell>
                        <span className="flex flex-col">
                          <span className="font-medium">{line.fuelName}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {line.fuelCode}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {format.fixed(line.conversionFactor, 3)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {format.fixed(line.fuelMeTon, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {format.fixed(line.fuelAeTon, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {format.fixed(line.totalTon, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {format.fixed(line.co2Ton, 2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {totals && dcs.fuel.length > 1 && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">{t('dcs.total')}</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-mono font-semibold tabular-nums">
                      {format.fixed(totals.me, 2)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold tabular-nums">
                      {format.fixed(totals.ae, 2)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold tabular-nums">
                      {format.fixed(totals.total, 2)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold tabular-nums">
                      {format.fixed(totals.co2, 2)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
          <Alert variant="info">
            <Info aria-hidden />
            <AlertDescription>{t('dcs.disclaimer')}</AlertDescription>
          </Alert>
          <MethodChips methodIds={dcs.methodIds} />
        </div>
      ) : null}
    </Section>
  );
}

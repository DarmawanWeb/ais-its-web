import { LineChart as LineChartIcon, Table2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';

import type { DailyCiiPointDto, DdVectorDto } from '@/shared/api/generated/emission/model';
import { CII_GRADE_COLORS } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/button';
import { Switch } from '@/shared/ui/switch';
import { Label } from '@/shared/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

import { useCiiFormat } from '../hooks/use-cii-format';
import { domainBands, isGrade, niceAxis, scaleDomain, scaleMax } from '../lib/grades';
import { GradeChip } from './grade';

interface ChartRow {
  day: string;
  time: number;
  cumulative: number | null;
  daily: number | null;
  required: number | null;
  point: DailyCiiPointDto;
}

function DailyTooltip({ active, payload }: TooltipContentProps<number, string>) {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  const row = payload?.[0]?.payload as ChartRow | undefined;
  if (!active || !row) return null;
  const grade = isGrade(row.point.cumulativeGrade) ? row.point.cumulativeGrade : null;
  return (
    <div className="min-w-56 rounded-lg border bg-elevated px-3 py-2 text-xs shadow-elevated">
      <p className="mb-1.5 flex items-center justify-between gap-3 font-semibold">
        {format.date(row.day)}
        <GradeChip grade={grade} size="sm" />
      </p>
      <dl className="space-y-1">
        {(
          [
            [t('daily.cumulative'), format.cii(row.cumulative)],
            [t('daily.rating'), format.rating(row.point.cumulativeRating)],
            [t('daily.daily'), format.cii(row.daily)],
            [t('daily.required'), format.cii(row.required)],
            [t('daily.distance'), `${format.number(row.point.distanceNm, 1)} nm`],
            [t('daily.co2'), `${format.number(row.point.co2Ton, 2)} t`],
            [t('daily.segments'), format.number(row.point.segments)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Year-to-date cumulative attained CII per day against the A–E bands of the year (d_i ×
 * required). One y axis (g CO2 / capacity · nm) for every series; bands carry their letters.
 */
export function DailyChart({
  points,
  dd,
  year,
}: {
  points: readonly DailyCiiPointDto[];
  dd: DdVectorDto | null;
  year: number;
}) {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  const id = useId();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [showDaily, setShowDaily] = useState(false);

  const rows = useMemo<ChartRow[]>(
    () =>
      points.map((point) => ({
        day: point.day,
        time: Date.parse(point.day),
        cumulative: point.cumulativeAttained,
        daily: point.attained,
        required: point.required,
        point,
      })),
    [points],
  );
  const values = rows
    .flatMap((row) => [row.cumulative, row.required, ...(showDaily ? [row.daily] : [])])
    .filter((value): value is number => value !== null && value !== undefined && value > 0);
  // Focus on the B–D bands (A and E as margins) like the rating scale, on a round axis.
  const axis = niceAxis(
    dd ? scaleDomain(dd, values, 0.35) : { min: 0, max: scaleMax(null, values) },
    6,
  );
  const bands = dd ? domainBands(dd, axis) : [];
  const last = [...rows].reverse().find((row) => row.cumulative !== null);
  const lastGrade = last && isGrade(last.point.cumulativeGrade) ? last.point.cumulativeGrade : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs"
          aria-label={t('daily.legend')}
        >
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-chart-1" aria-hidden />
            <span className="text-muted-foreground">{t('daily.cumulative')}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-foreground/70" aria-hidden />
            <span className="text-muted-foreground">{t('daily.required')}</span>
          </li>
          {showDaily && (
            <li className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-chart-2" aria-hidden />
              <span className="text-muted-foreground">{t('daily.daily')}</span>
            </li>
          )}
          {dd && (
            <li className="flex items-center gap-1.5">
              <span className="flex gap-px" aria-hidden>
                {(['A', 'B', 'C', 'D', 'E'] as const).map((grade) => (
                  <span
                    key={grade}
                    className="size-2.5 first:rounded-l-sm last:rounded-r-sm"
                    style={{ background: CII_GRADE_COLORS[grade], opacity: 0.55 }}
                  />
                ))}
              </span>
              <span className="text-muted-foreground">{t('daily.bands')}</span>
            </li>
          )}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id={`${id}-daily`} checked={showDaily} onCheckedChange={setShowDaily} />
            <Label htmlFor={`${id}-daily`} className="text-xs text-muted-foreground">
              {t('daily.showDaily')}
            </Label>
          </div>
          <div className="flex gap-1" role="group" aria-label={t('fleet.view')}>
            <Button
              variant={view === 'chart' ? 'subtle' : 'ghost'}
              size="xs"
              aria-pressed={view === 'chart'}
              onClick={() => setView('chart')}
            >
              <LineChartIcon /> {t('fleet.chartView')}
            </Button>
            <Button
              variant={view === 'table' ? 'subtle' : 'ghost'}
              size="xs"
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              <Table2 /> {t('fleet.tableView')}
            </Button>
          </div>
        </div>
      </div>

      {view === 'chart' ? (
        <figure className="h-72 min-w-0" aria-labelledby={`${id}-caption`}>
          <figcaption id={`${id}-caption`} className="sr-only">
            {last
              ? t('daily.summary', {
                  year,
                  day: format.date(last.day),
                  value: format.cii(last.cumulative),
                  grade: lastGrade ?? '—',
                })
              : t('daily.title', { year })}
          </figcaption>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 24, bottom: 0, left: -8 }}>
              {bands.map((band) => (
                <ReferenceArea
                  key={band.grade}
                  y1={band.from}
                  y2={band.to}
                  ifOverflow="hidden"
                  fill={CII_GRADE_COLORS[band.grade]}
                  fillOpacity={0.13}
                  strokeOpacity={0}
                  label={{
                    value: band.grade,
                    position: 'insideTopRight',
                    fill: 'var(--muted-foreground)',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                />
              ))}
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(value: number) => format.dayMonth(new Date(value).toISOString())}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              />
              <YAxis
                domain={[axis.min, axis.max]}
                ticks={axis.ticks}
                allowDataOverflow
                tickFormatter={(value: number) => format.number(value, 1)}
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              />
              <Tooltip
                content={(props) => (
                  <DailyTooltip {...(props as TooltipContentProps<number, string>)} />
                )}
                cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
              />
              <Line
                dataKey="required"
                stroke="var(--foreground)"
                strokeOpacity={0.7}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              {showDaily && (
                <Line
                  dataKey="daily"
                  stroke="var(--chart-2)"
                  strokeWidth={1}
                  strokeOpacity={0.8}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
              <Line
                dataKey="cumulative"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </figure>
      ) : (
        <div className="max-h-80 overflow-auto rounded-lg border">
          <Table aria-label={t('daily.title', { year })}>
            <TableHeader className="sticky top-0 bg-surface">
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('daily.day')}</TableHead>
                <TableHead className="text-right">{t('daily.cumulative')}</TableHead>
                <TableHead className="text-right">{t('daily.rating')}</TableHead>
                <TableHead>{t('columns.grade')}</TableHead>
                <TableHead className="text-right">{t('daily.daily')}</TableHead>
                <TableHead className="text-right">{t('daily.distance')}</TableHead>
                <TableHead className="text-right">{t('daily.co2')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...rows].reverse().map((row) => (
                <TableRow key={row.day}>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {format.date(row.day)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {format.cii(row.cumulative)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {format.rating(row.point.cumulativeRating)}
                  </TableCell>
                  <TableCell>
                    <GradeChip
                      grade={isGrade(row.point.cumulativeGrade) ? row.point.cumulativeGrade : null}
                      size="sm"
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {format.cii(row.daily)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {format.number(row.point.distanceNm, 1)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {format.number(row.point.co2Ton, 2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

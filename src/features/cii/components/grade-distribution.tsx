import { CII_GRADE_LABELS } from '@darmawanweb/ais-its-contracts/domain';
import { BarChart3, Table2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';

import type { GradeCountsDto } from '@/shared/api/generated/emission/model';
import { CII_GRADE_COLORS } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

import { useCiiFormat } from '../hooks/use-cii-format';
import { type GradeShare, gradeShares } from '../lib/grades';
import { GradeChip } from './grade';

function DistributionTooltip({ active, payload }: TooltipContentProps<number, string>) {
  const { t, i18n } = useTranslation('cii');
  const format = useCiiFormat();
  const row = payload?.[0]?.payload as GradeShare | undefined;
  if (!active || !row) return null;
  const locale = i18n.language === 'en' ? 'en' : 'id';
  return (
    <div className="min-w-44 rounded-lg border bg-elevated px-3 py-2 text-xs shadow-elevated">
      <p className="flex items-center gap-2 font-semibold">
        <GradeChip grade={row.grade} size="sm" /> {CII_GRADE_LABELS[row.grade][locale]}
      </p>
      <p className="mt-1.5 flex justify-between gap-4 text-muted-foreground">
        {t('fleet.vessels')}
        <span className="font-mono text-foreground tabular-nums">{format.number(row.count)}</span>
      </p>
      <p className="flex justify-between gap-4 text-muted-foreground">
        {t('fleet.share')}
        <span className="font-mono text-foreground tabular-nums">
          {format.percent(row.share * 100, 0)}
        </span>
      </p>
    </div>
  );
}

/**
 * Fleet grade distribution: one column per grade in A–E order on the fixed IMO colours, each
 * labelled with its letter (x axis) and count (direct label), hover tooltip and a table view.
 */
export function GradeDistribution({
  grades,
  notAvailable,
}: {
  grades: GradeCountsDto;
  notAvailable: number;
}) {
  const { t, i18n } = useTranslation('cii');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const format = useCiiFormat();
  const titleId = useId();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const rows = gradeShares(grades);
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={titleId} className="text-sm text-muted-foreground">
          {t('fleet.distributionCaption', { count: total })}
        </p>
        <div className="flex gap-1" role="group" aria-label={t('fleet.view')}>
          <Button
            variant={view === 'chart' ? 'subtle' : 'ghost'}
            size="xs"
            aria-pressed={view === 'chart'}
            onClick={() => setView('chart')}
          >
            <BarChart3 /> {t('fleet.chartView')}
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
      {view === 'chart' ? (
        <figure
          aria-labelledby={titleId}
          aria-describedby={`${titleId}-summary`}
          className="h-56 min-w-0"
        >
          <p id={`${titleId}-summary`} className="sr-only">
            {rows
              .map((row) => `${t('grade.short', { grade: row.grade })}: ${row.count}`)
              .join(', ')}
          </p>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              margin={{ top: 22, right: 8, bottom: 0, left: -18 }}
              barCategoryGap="18%"
            >
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="grade"
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--foreground)', fontSize: 13, fontWeight: 700 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                content={(props) => (
                  <DistributionTooltip {...(props as TooltipContentProps<number, string>)} />
                )}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {rows.map((row) => (
                  <Cell key={row.grade} fill={CII_GRADE_COLORS[row.grade]} />
                ))}
                <LabelList
                  dataKey="count"
                  position="top"
                  className="fill-foreground font-mono text-xs font-semibold"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </figure>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table aria-labelledby={titleId}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('columns.grade')}</TableHead>
                <TableHead className="text-right">{t('fleet.vessels')}</TableHead>
                <TableHead className="text-right">{t('fleet.share')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.grade}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <GradeChip grade={row.grade} size="sm" />
                      {CII_GRADE_LABELS[row.grade][locale]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {format.number(row.count)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {format.percent(row.share * 100, 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {notAvailable > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('fleet.notAvailableNote', { count: notAvailable })}
        </p>
      )}
    </div>
  );
}

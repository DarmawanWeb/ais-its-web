import type { ColumnDef } from '@tanstack/react-table';
import { Columns2, Eye, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { SeempMeasureDto, SeempScenarioDto } from '@/shared/api/generated/emission/model';
import { useSeempControllerDeleteScenario } from '@/shared/api/generated/emission/seemp/seemp';
import { Can, usePermission } from '@/shared/auth';
import { ConfirmDialog } from '@/shared/domain-ui/confirm-dialog';
import { DataTable, usePageState } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { MmsiText } from '@/shared/domain-ui/values';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { toast } from '@/shared/ui/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

import { useInvalidateScenarios, useScenarios } from '../api/queries';
import { useMeasureText } from '../hooks/use-measure-text';
import { useSeempFormat } from '../hooks/use-seemp-format';
import { costPerPercent } from '../lib/economics';
import { isGrade } from '../lib/grade-style';
import { seempProblemKey } from '../lib/problems';
import { GradeChange } from './bits';
import { SimulationResult } from './simulation';

/** Most scenarios the comparison shows side by side. */
export const MAX_COMPARE = 3;

function MeasureList({
  codes,
  measures,
}: {
  codes: readonly string[];
  measures: readonly SeempMeasureDto[];
}) {
  const text = useMeasureText();
  const names = new Map(measures.map((measure) => [measure.code, measure.name]));
  return (
    <ul className="flex flex-wrap gap-1">
      {codes.map((code) => (
        <li key={code} className="rounded-md border bg-muted/40 px-1.5 py-0.5 text-[11px]">
          {text(code, names.get(code)).name}
        </li>
      ))}
    </ul>
  );
}

function ScenarioDialog({
  scenario,
  measures,
  onOpenChange,
}: {
  scenario: SeempScenarioDto | null;
  measures: readonly SeempMeasureDto[];
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('seemp');
  const format = useSeempFormat();
  return (
    <Dialog open={!!scenario} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {scenario && (
          <>
            <DialogHeader>
              <DialogTitle>{scenario.name}</DialogTitle>
              <DialogDescription>
                {t('scenarios.viewDescription', {
                  baseline: scenario.baselineYear,
                  target: scenario.targetYear,
                  time: format.dateTime(scenario.createdAt),
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t('scenarios.measures')}</p>
              <MeasureList codes={scenario.measureCodes} measures={measures} />
            </div>
            <SimulationResult result={scenario.result} baselineCo2={null} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CompareDialog({
  scenarios,
  measures,
  open,
  onOpenChange,
}: {
  scenarios: readonly SeempScenarioDto[];
  measures: readonly SeempMeasureDto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('seemp');
  const format = useSeempFormat();
  const best = (pick: (scenario: SeempScenarioDto) => number, lowest: boolean) => {
    const values = scenarios.map(pick);
    return lowest ? Math.min(...values) : Math.max(...values);
  };
  const bestReduction = best((scenario) => scenario.result.reductionPercent, false);
  const bestCost = best((scenario) => scenario.result.costUsdPerYear, true);
  const rows: {
    key: string;
    label: string;
    cell: (scenario: SeempScenarioDto) => React.ReactNode;
  }[] = [
    {
      key: 'grade',
      label: t('compare.grade'),
      cell: (scenario) => (
        <GradeChange
          before={isGrade(scenario.result.before.grade) ? scenario.result.before.grade : null}
          after={isGrade(scenario.result.after.grade) ? scenario.result.after.grade : null}
        />
      ),
    },
    {
      key: 'ratingAfter',
      label: t('compare.ratingAfter'),
      cell: (scenario) => (
        <span className="font-mono tabular-nums">
          {format.rating(scenario.result.after.rating)}
        </span>
      ),
    },
    {
      key: 'reduction',
      label: t('compare.reduction'),
      cell: (scenario) => (
        <span className="font-mono tabular-nums">
          {format.percent(scenario.result.reductionPercent, 1)}
          {scenario.result.reductionPercent === bestReduction && scenarios.length > 1 && (
            <span className="ml-1.5 font-sans text-[11px] font-medium text-success">
              {t('compare.best')}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'cost',
      label: t('compare.costPerYear'),
      cell: (scenario) => (
        <span className="font-mono tabular-nums">
          {format.usd(scenario.result.costUsdPerYear)}
          {scenario.result.costUsdPerYear === bestCost && scenarios.length > 1 && (
            <span className="ml-1.5 font-sans text-[11px] font-medium text-success">
              {t('compare.cheapest')}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'perPercent',
      label: t('compare.costPerPercent'),
      cell: (scenario) => {
        const value = costPerPercent(
          scenario.result.costUsdPerYear,
          scenario.result.reductionPercent,
        );
        return (
          <span className="font-mono tabular-nums">{value === null ? '—' : format.usd(value)}</span>
        );
      },
    },
    {
      key: 'years',
      label: t('compare.amortization'),
      cell: (scenario) => t('recommendations.years', { count: scenario.result.yearsUntilInferior }),
    },
    {
      key: 'fuel',
      label: t('compare.fuelAfter'),
      cell: (scenario) => (
        <span className="font-mono text-xs tabular-nums">
          ME {format.fixed(scenario.result.fuelAfter.meTon, 1)} · AE{' '}
          {format.fixed(scenario.result.fuelAfter.aeTon, 1)} · C_F{' '}
          {format.fixed(scenario.result.fuelAfter.conversionFactor, 2)}
        </span>
      ),
    },
    {
      key: 'years-used',
      label: t('compare.years'),
      cell: (scenario) => `${scenario.baselineYear} → ${scenario.targetYear}`,
    },
    {
      key: 'measures',
      label: t('scenarios.measures'),
      cell: (scenario) => <MeasureList codes={scenario.measureCodes} measures={measures} />,
    },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('compare.title')}</DialogTitle>
          <DialogDescription>{t('compare.description')}</DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto rounded-lg border">
          <Table aria-label={t('compare.title')}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>
                  <span className="sr-only">{t('compare.metric')}</span>
                </TableHead>
                {scenarios.map((scenario) => (
                  <TableHead key={scenario.id} className="min-w-48 normal-case">
                    {scenario.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableHead scope="row" className="text-xs whitespace-nowrap">
                    {row.label}
                  </TableHead>
                  {scenarios.map((scenario) => (
                    <TableCell key={scenario.id} className="align-top whitespace-normal">
                      {row.cell(scenario)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Saved scenarios of the organization (or of one vessel): view, delete (seemp:simulate) and
 * compare up to three side by side.
 */
export function ScenariosTable({
  mmsi,
  measures,
  showVessel = false,
}: {
  mmsi?: number;
  measures: readonly SeempMeasureDto[];
  showVessel?: boolean;
}) {
  const { t } = useTranslation('seemp');
  const format = useSeempFormat();
  const canDelete = usePermission('seemp:simulate');
  const paging = usePageState({ pageSize: 10 });
  const query = useScenarios({
    page: paging.page,
    pageSize: paging.pageSize,
    ...(mmsi ? { mmsi } : {}),
  });
  const remove = useSeempControllerDeleteScenario();
  const invalidate = useInvalidateScenarios();
  const [viewing, setViewing] = useState<SeempScenarioDto | null>(null);
  const [deleting, setDeleting] = useState<SeempScenarioDto | null>(null);
  const [selected, setSelected] = useState<SeempScenarioDto[]>([]);
  const [comparing, setComparing] = useState(false);

  const toggle = (scenario: SeempScenarioDto) =>
    setSelected((current) =>
      current.some((item) => item.id === scenario.id)
        ? current.filter((item) => item.id !== scenario.id)
        : current.length >= MAX_COMPARE
          ? current
          : [...current, scenario],
    );

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync({ id: deleting.id });
      setSelected((current) => current.filter((item) => item.id !== deleting.id));
      await invalidate();
      toast.success(t('scenarios.deleted', { name: deleting.name }));
    } catch (error) {
      const key = seempProblemKey(error);
      toast.error(key ? t(`problems.${key}.title`) : t('scenarios.deleteFailed'));
    }
  };

  const columns = useMemo<ColumnDef<SeempScenarioDto>[]>(
    () => [
      {
        id: 'select',
        header: () => <span className="sr-only">{t('compare.select')}</span>,
        meta: { label: t('compare.select'), alwaysVisible: true },
        cell: ({ row }) => {
          const checked = selected.some((item) => item.id === row.original.id);
          return (
            <Checkbox
              checked={checked}
              disabled={!checked && selected.length >= MAX_COMPARE}
              onCheckedChange={() => toggle(row.original)}
              onClick={(event) => event.stopPropagation()}
              aria-label={t('compare.selectScenario', { name: row.original.name })}
            />
          );
        },
      },
      {
        id: 'name',
        header: t('scenarios.name'),
        meta: { label: t('scenarios.name'), alwaysVisible: true },
        cell: ({ row }) => (
          <span className="flex min-w-44 flex-col gap-1">
            <span className="font-medium">{row.original.name}</span>
            <MeasureList codes={row.original.measureCodes} measures={measures} />
          </span>
        ),
      },
      ...(showVessel
        ? [
            {
              id: 'vessel',
              header: t('scenarios.vessel'),
              meta: { label: t('scenarios.vessel') },
              cell: ({ row }) => (
                <Link
                  to={`/seemp/vessels/${row.original.mmsi}`}
                  className="text-primary hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MmsiText mmsi={row.original.mmsi} />
                </Link>
              ),
            } satisfies ColumnDef<SeempScenarioDto>,
          ]
        : []),
      {
        id: 'grade',
        header: t('scenarios.grade'),
        meta: { label: t('scenarios.grade') },
        cell: ({ row }) => (
          <GradeChange
            before={
              isGrade(row.original.result.before.grade) ? row.original.result.before.grade : null
            }
            after={
              isGrade(row.original.result.after.grade) ? row.original.result.after.grade : null
            }
          />
        ),
      },
      {
        id: 'reduction',
        header: t('scenarios.reduction'),
        meta: { label: t('scenarios.reduction'), className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {format.percent(row.original.result.reductionPercent, 1)}
          </span>
        ),
      },
      {
        id: 'cost',
        header: t('scenarios.costPerYear'),
        meta: { label: t('scenarios.costPerYear'), className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {format.usd(row.original.result.costUsdPerYear)}
          </span>
        ),
      },
      {
        id: 'years',
        header: t('scenarios.years'),
        meta: { label: t('scenarios.years') },
        cell: ({ row }) => (
          <span className="font-mono text-xs whitespace-nowrap tabular-nums">
            {row.original.baselineYear} → {row.original.targetYear}
          </span>
        ),
      },
      {
        id: 'created',
        header: t('scenarios.created'),
        meta: { label: t('scenarios.created') },
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {format.dateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('scenarios.actions')}</span>,
        meta: { label: t('scenarios.actions'), alwaysVisible: true, className: 'text-right' },
        cell: ({ row }) => (
          <span className="flex justify-end gap-1">
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                setViewing(row.original);
              }}
              aria-label={t('scenarios.view', { name: row.original.name })}
            >
              <Eye />
            </Button>
            {canDelete && (
              <Button
                size="icon-xs"
                variant="ghost"
                className="text-danger hover:text-danger"
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleting(row.original);
                }}
                aria-label={t('scenarios.delete', { name: row.original.name })}
              >
                <Trash2 />
              </Button>
            )}
          </span>
        ),
      },
    ],

    [t, format, measures, selected, showVessel, canDelete],
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <DataTable
        columns={columns}
        data={query.data?.data}
        loading={query.isPending}
        error={query.isError ? query.error : undefined}
        onRetry={() => void query.refetch()}
        getRowId={(row) => row.id}
        onRowClick={(row) => setViewing(row)}
        pagination={query.data ? paging.adapter(query.data.meta) : undefined}
        ariaLabel={t('scenarios.tableLabel')}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={selected.length < 2}
              onClick={() => setComparing(true)}
            >
              <Columns2 /> {t('compare.button', { count: selected.length })}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t('compare.hint', { max: MAX_COMPARE })}
            </span>
          </div>
        }
        emptyState={
          <EmptyState
            size="sm"
            title={t('scenarios.emptyTitle')}
            description={
              <Can permission="seemp:simulate" fallback={t('scenarios.emptyReadOnly')}>
                {t('scenarios.emptyDescription')}
              </Can>
            }
          />
        }
      />
      <ScenarioDialog
        scenario={viewing}
        measures={measures}
        onOpenChange={(open) => !open && setViewing(null)}
      />
      <CompareDialog
        scenarios={selected}
        measures={measures}
        open={comparing}
        onOpenChange={setComparing}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('scenarios.deleteTitle')}
        description={t('scenarios.deleteDescription', { name: deleting?.name ?? '' })}
        confirmLabel={t('scenarios.deleteConfirm')}
        destructive
        onConfirm={confirmDelete}
      />
      {selected.length > 0 && (
        <p className="sr-only" aria-live="polite">
          {t('compare.selected', { count: selected.length })}
        </p>
      )}
    </div>
  );
}

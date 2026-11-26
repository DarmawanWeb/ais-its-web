import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ReductionFactorDto } from '@/shared/api/generated/emission/model';
import {
  getReductionFactorsControllerListQueryKey,
  useReductionFactorsControllerPut,
} from '@/shared/api/generated/emission/reduction-factors/reduction-factors';
import { isApiProblem } from '@/shared/api/problem';
import { ConfirmDialog } from '@/shared/domain-ui/confirm-dialog';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/sonner';

import { ciiProblemKey } from '../lib/problems';
import {
  changedItems,
  type FactorRow,
  nextYear,
  rowIssues,
  rowsOf,
} from '../lib/reduction-factors';

function EditorBody({
  factors,
  onClose,
}: {
  factors: readonly ReductionFactorDto[];
  onClose: () => void;
}) {
  const { t } = useTranslation('cii');
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<FactorRow[]>(() => rowsOf(factors));
  const [confirming, setConfirming] = useState(false);
  const mutation = useReductionFactorsControllerPut();

  const years = rows.map((row) => row.year);
  const issues = rows.map((row) => rowIssues(row, years));
  const valid = issues.every((list) => list.length === 0);
  const changes = valid ? changedItems(rows) : [];

  const update = (key: string, patch: Partial<FactorRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = () =>
    setRows((current) => [
      ...current,
      {
        key: `new-${current.length}-${nextYear(current)}`,
        year: String(nextYear(current)),
        zPercent: '',
        source: '',
        isNew: true,
      },
    ]);

  const save = async () => {
    try {
      await mutation.mutateAsync({ data: { items: changes } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getReductionFactorsControllerListQueryKey() }),
        queryClient.invalidateQueries({
          predicate: (query) => {
            const head = query.queryKey[0];
            return typeof head === 'string' && head.startsWith('/api/v2/cii/');
          },
        }),
      ]);
      toast.success(t('factors.saved', { count: changes.length }));
      onClose();
    } catch (error) {
      const key = ciiProblemKey(error);
      const details =
        key === 'validation' && isApiProblem(error)
          ? error.errors.map((item) => `${item.field}: ${item.message}`).join('; ')
          : '';
      toast.error(details || (key ? t(`problems.${key}.title`) : t('factors.saveFailed')));
    }
  };

  return (
    <>
      <div className="max-h-[55dvh] overflow-auto rounded-lg border">
        <table className="w-full text-sm" aria-label={t('factors.editTableLabel')}>
          <thead className="sticky top-0 bg-surface text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium">{t('columns.year')}</th>
              <th className="px-3 py-2 text-left font-medium">Z (%)</th>
              <th className="px-3 py-2 text-left font-medium">{t('factors.source')}</th>
              <th className="px-3 py-2">
                <span className="sr-only">{t('columns.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowIssue = issues[index] ?? [];
              return (
                <tr key={row.key} className="border-b align-top last:border-b-0">
                  <td className="px-3 py-2">
                    <Input
                      value={row.year}
                      onChange={(event) => update(row.key, { year: event.target.value })}
                      disabled={!row.isNew}
                      inputMode="numeric"
                      className="w-24 font-mono"
                      aria-label={t('factors.yearOf', { index: index + 1 })}
                      aria-invalid={
                        rowIssue.includes('year') || rowIssue.includes('duplicate') || undefined
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={row.zPercent}
                      onChange={(event) => update(row.key, { zPercent: event.target.value })}
                      inputMode="decimal"
                      className="w-28 font-mono"
                      aria-label={t('factors.zOf', { year: row.year })}
                      aria-invalid={rowIssue.includes('z') || undefined}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={row.source}
                      onChange={(event) => update(row.key, { source: event.target.value })}
                      className="min-w-56"
                      aria-label={t('factors.sourceOf', { year: row.year })}
                      aria-invalid={rowIssue.includes('source') || undefined}
                    />
                    {rowIssue.length > 0 && (
                      <p className="mt-1 text-xs text-danger">
                        {rowIssue.map((issue) => t(`factors.issues.${issue}`)).join(' · ')}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.isNew && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() =>
                          setRows((current) => current.filter((item) => item.key !== row.key))
                        }
                        aria-label={t('factors.removeRow', { year: row.year })}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus /> {t('factors.addYear')}
        </Button>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {valid ? t('factors.changes', { count: changes.length }) : t('factors.fixErrors')}
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common:actions.cancel')}
        </Button>
        <Button
          type="button"
          disabled={!valid || changes.length === 0}
          onClick={() => setConfirming(true)}
        >
          {t('common:actions.save')}
        </Button>
      </DialogFooter>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('factors.confirmTitle')}
        description={t('factors.confirmDescription', { count: changes.length })}
        confirmLabel={t('factors.confirm')}
        onConfirm={save}
      />
    </>
  );
}

/** Editor of the reduction factors Z (reference:write); saving republishes every CII. */
export function ReductionFactorsEditor({
  factors,
  open,
  onOpenChange,
}: {
  factors: readonly ReductionFactorDto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('cii');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('factors.editTitle')}</DialogTitle>
          <DialogDescription>{t('factors.editDescription')}</DialogDescription>
        </DialogHeader>
        {/* Mounted while open only: every opening starts from the stored factors. */}
        <EditorBody factors={factors} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

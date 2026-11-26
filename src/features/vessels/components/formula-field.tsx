import type { TFunction } from 'i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { FunctionSquare, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { useFuelFormulasControllerCreate } from '@/shared/api/generated/fleet/fuel-formulas/fuel-formulas';
import type { FuelFormulaDto } from '@/shared/api/generated/fleet/model';
import { isApiProblem } from '@/shared/api/problem';
import { Can } from '@/shared/auth/guards';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { formatNumber } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/sonner';
import { Textarea } from '@/shared/ui/textarea';

import { useRefreshFormulas } from '../api/reference-data';
import {
  checkFuelFormula,
  evaluateFuelFormula,
  FUEL_FORMULA_MAX_LENGTH,
} from '../lib/fuel-formula';
import { formulaIssueMessage } from '../lib/fuel-formula-messages';
import { problemSummary } from '@/shared/api/problem-copy';
import { fleetProblemCopies } from '../lib/problems';
import type { VesselFormValues } from '../lib/vessel-form';
import { SelectField } from './form-fields';

type Translate = TFunction;

function formulaSchema(t: Translate) {
  const expression = z.string().superRefine((value, ctx) => {
    const check = checkFuelFormula(value);
    if (!check.valid)
      ctx.addIssue({ code: 'custom', message: formulaIssueMessage(check.issue, t) });
  });
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, { message: t('form.errors.required') })
      .max(120, { message: t('form.errors.maxLength', { max: 120 }) }),
    mainEngineFormula: expression,
    auxiliaryEngineFormula: expression,
  });
}

type FormulaValues = z.infer<ReturnType<typeof formulaSchema>>;

function Preview({ formula, speed }: { formula: string; speed: number | null }) {
  const { t, i18n } = useTranslation('vessels');
  if (speed === null)
    return <span className="text-muted-foreground">{t('formula.needSpeed')}</span>;
  const value = evaluateFuelFormula(formula, speed);
  if (value === null)
    return <span className="text-muted-foreground">{t('formula.previewUnavailable')}</span>;
  return (
    <span className="font-mono tabular-nums">
      {formatNumber(Math.max(value, 0.5), i18n.language, { maximumFractionDigits: 3 })}
      <span className="ml-1 font-sans text-xs text-muted-foreground">{t('formula.unit')}</span>
    </span>
  );
}

/** New first fuel formula (reference data, `reference:write`), validated by the safe grammar. */
function NewFormulaDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (formula: FuelFormulaDto) => void;
}) {
  const { t } = useTranslation('vessels');
  const create = useFuelFormulasControllerCreate();
  const refresh = useRefreshFormulas();
  const form = useForm<FormulaValues>({
    resolver: zodResolver(formulaSchema(t)),
    mode: 'onChange',
    defaultValues: { name: '', mainEngineFormula: '', auxiliaryEngineFormula: '' },
  });
  const submit = form.handleSubmit(async (values) => {
    try {
      const formula = await create.mutateAsync({ data: values });
      await refresh();
      toast.success(t('formula.created', { name: formula.name }));
      onCreated(formula);
      form.reset();
      onOpenChange(false);
    } catch (error) {
      if (isApiProblem(error)) {
        for (const { field, message } of error.errors) {
          if (
            field === 'name' ||
            field === 'mainEngineFormula' ||
            field === 'auxiliaryEngineFormula'
          ) {
            form.setError(field, { message });
          }
        }
      }
      toast.error(t('formula.createFailed'), {
        description: problemSummary(error, fleetProblemCopies(t)),
      });
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('formula.newTitle')}</DialogTitle>
          <DialogDescription>{t('formula.newDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={(event) => void submit(event)} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="content-start">
                  <FormLabel>{t('formula.name')}</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={120} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {(['mainEngineFormula', 'auxiliaryEngineFormula'] as const).map((name) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem className="content-start">
                    <FormLabel>
                      {name === 'mainEngineFormula' ? t('formula.main') : t('formula.auxiliary')}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={2}
                        spellCheck={false}
                        maxLength={FUEL_FORMULA_MAX_LENGTH + 1}
                        className="font-mono text-xs"
                        placeholder="-0.0382 * speedKnot ** 2 + 0.8658 * speedKnot - 0.0197"
                      />
                    </FormControl>
                    <FormDescription>{t('formula.grammarHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? t('common:actions.saving') : t('formula.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * First fuel formula of the vessel: a formula of the catalogue (or none → Holtrop fallback),
 * previewed at the service speed; administrators can add a formula on the spot.
 */
export function FormulaField({ formulas }: { formulas: readonly FuelFormulaDto[] }) {
  const { t } = useTranslation('vessels');
  const { control, setValue } = useFormContext<VesselFormValues>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const selectedId = useWatch({ control, name: 'firstFuelFormulaId' });
  const speed = useWatch({ control, name: 'dimensions.vs' });
  const selected = formulas.find((formula) => formula.id === selectedId);
  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <SelectField
          className="flex-1"
          name="firstFuelFormulaId"
          label={t('fields.firstFuelFormula')}
          hint={<MethodInfo methodId="fuel.first_formula" />}
          placeholder={t('formula.choose')}
          noneLabel={t('formula.none')}
          options={formulas.map((formula) => ({ value: formula.id, label: formula.name }))}
        />
        <Can permission="reference:write">
          <Button type="button" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus /> {t('formula.new')}
          </Button>
        </Can>
      </div>
      {selected ? (
        <div className="grid gap-3 rounded-lg border bg-muted/15 p-4">
          {(
            [
              ['main', selected.mainEngineFormula],
              ['auxiliary', selected.auxiliaryEngineFormula],
            ] as const
          ).map(([role, formula]) => (
            <div key={role} className="grid gap-1.5">
              <p className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                {role === 'main' ? t('formula.main') : t('formula.auxiliary')}
                <span>
                  {t('formula.atServiceSpeed')} <Preview formula={formula} speed={speed} />
                </span>
              </p>
              <code className="block overflow-x-auto rounded-md border bg-background/60 px-3 py-2 font-mono text-xs whitespace-pre">
                {formula}
              </code>
            </div>
          ))}
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <FunctionSquare className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {t('formula.noneHint')} <MethodInfo methodId="fuel.method_selection" />
          </span>
        </p>
      )}
      <NewFormulaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(formula) => setValue('firstFuelFormulaId', formula.id, { shouldDirty: true })}
      />
    </div>
  );
}

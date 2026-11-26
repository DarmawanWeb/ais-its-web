import { zodResolver } from '@hookform/resolvers/zod';
import { ClipboardPen } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { type Resolver, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { TelemetryVesselDto } from '@/shared/api/generated/telemetry/model';
import { useReadingsControllerIngest } from '@/shared/api/generated/telemetry/readings/readings';
import { type ApiProblem, toApiProblem } from '@/shared/api/problem';
import { ErrorState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/sonner';

import { useInvalidateTelemetry } from '../api/telemetry';
import { localizeProblem } from '@/shared/api/problem-copy';
import { telemetryProblemCopies } from '../lib/problems';
import {
  createReadingSchema,
  READING_LIMITS,
  readingFieldOfProblem,
  type ReadingFormValues,
  toLocalInput,
  toReadingInput,
} from '../lib/reading-form';
import { nowMs } from '@/shared/lib/clock';

function defaults(mmsi: number | null): ReadingFormValues {
  return {
    mmsi: mmsi ? String(mmsi) : '',
    time: toLocalInput(new Date(nowMs())),
    periodStart: '',
    fuelMeTon: null,
    fuelAeTon: null,
  };
}

function AmountField({
  name,
  label,
  max,
}: {
  name: 'fuelMeTon' | 'fuelAeTon';
  label: string;
  max: number;
}) {
  const { t } = useTranslation('telemetry');
  return (
    <FormField
      name={name}
      render={({ field }) => (
        <FormItem className="content-start">
          <FormLabel>{label}</FormLabel>
          <div className="relative">
            <FormControl>
              <Input
                type="number"
                inputMode="decimal"
                step="0.001"
                min={0}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={
                  typeof field.value === 'number' && Number.isFinite(field.value) ? field.value : ''
                }
                onChange={(event) =>
                  field.onChange(event.target.value === '' ? null : event.target.valueAsNumber)
                }
                className="pr-8 font-mono tabular-nums"
              />
            </FormControl>
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
              t
            </span>
          </div>
          <FormDescription>{t('manual.maxHint', { max })}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Manual fuel reading (`POST /telemetry/readings?source=manual`, `telemetry:write`): one reading
 * of a vessel of the organization; a different reading at the same time is `409 READING_CONFLICT`.
 */
export function ManualReadingDialog({
  vessels,
  selected,
  trigger,
}: {
  vessels: readonly TelemetryVesselDto[];
  selected: number | null;
  trigger: (open: () => void) => ReactNode;
}) {
  const { t } = useTranslation('telemetry');
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const ingest = useReadingsControllerIngest();
  const invalidate = useInvalidateTelemetry();
  const copies = useMemo(() => telemetryProblemCopies(t), [t]);
  const schema = useMemo(() => createReadingSchema(t), [t]);
  const form = useForm<ReadingFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<ReadingFormValues>,
    defaultValues: defaults(selected),
    mode: 'onTouched',
  });

  const show = () => {
    form.reset(defaults(selected));
    setProblem(null);
    setOpen(true);
  };

  const submit = form.handleSubmit(async (values) => {
    setProblem(null);
    const input = toReadingInput(values);
    try {
      const result = await ingest.mutateAsync({ data: input, params: { source: 'manual' } });
      invalidate(input.mmsi);
      if (result.duplicates > 0 && result.accepted === 0) toast.info(t('manual.duplicate'));
      else toast.success(t('manual.saved'), { description: t('manual.savedHint') });
      setOpen(false);
    } catch (error) {
      const failure = toApiProblem(error);
      if (failure.code === 'READING_CONFLICT') {
        form.setError('time', { message: t('manual.errors.conflict') }, { shouldFocus: true });
      }
      for (const fieldError of failure.errors) {
        const field = readingFieldOfProblem(fieldError.field);
        if (field && failure.code !== 'READING_CONFLICT')
          form.setError(field, { message: fieldError.message });
      }
      if (failure.code === 'VESSEL_NOT_FOUND' || failure.code === 'FORBIDDEN') {
        form.setError('mmsi', { message: copies[failure.code]?.title });
      }
      setProblem(localizeProblem(failure, copies) ?? failure);
    }
  });

  return (
    <>
      {trigger(show)}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardPen className="size-4 text-primary" aria-hidden /> {t('manual.title')}
            </DialogTitle>
            <DialogDescription className="flex items-start gap-1">
              {t('manual.description')} <MethodInfo methodId="telemetry.reading_validation" />
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              noValidate
              onSubmit={(event) => void submit(event)}
              className="grid gap-4"
              aria-label={t('manual.title')}
            >
              {problem && (
                <div
                  className="rounded-lg border border-danger/40 bg-danger/5"
                  data-testid="reading-error"
                >
                  <ErrorState error={problem} size="sm" />
                </div>
              )}
              <FormField
                control={form.control}
                name="mmsi"
                render={({ field }) => (
                  <FormItem className="content-start">
                    <FormLabel>{t('manual.vessel')}</FormLabel>
                    <Select name={field.name} value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger ref={field.ref} className="w-full">
                          <SelectValue placeholder={t('manual.chooseVessel')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {vessels.map((vessel) => (
                          <SelectItem key={vessel.mmsi} value={String(vessel.mmsi)}>
                            {vessel.name} · {vessel.mmsi}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="time"
                  render={({ field }) => (
                    <FormItem className="content-start">
                      <FormLabel>{t('manual.time')}</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormDescription>{t('manual.timeHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="periodStart"
                  render={({ field }) => (
                    <FormItem className="content-start">
                      <FormLabel>{t('manual.periodStart')}</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormDescription>
                        {t('manual.periodHint', { hours: READING_LIMITS.maxPeriodH })}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <AmountField
                  name="fuelMeTon"
                  label={t('manual.fuelMe')}
                  max={READING_LIMITS.maxFuelMeTon}
                />
                <AmountField
                  name="fuelAeTon"
                  label={t('manual.fuelAe')}
                  max={READING_LIMITS.maxFuelAeTon}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={ingest.isPending} data-testid="reading-save">
                  {ingest.isPending ? t('common:actions.saving') : t('manual.save')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

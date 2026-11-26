import { zodResolver } from '@hookform/resolvers/zod';
import { FilePenLine, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from '@/shared/ui/sonner';
import * as z from 'zod';

import {
  useCiiControllerGetManual,
  useCiiControllerPutManual,
} from '@/shared/api/generated/emission/cii/cii';
import type { AnnualManualDto, PutAnnualManualDto } from '@/shared/api/generated/emission/model';
import { isApiProblem } from '@/shared/api/problem';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';
import { Spinner } from '@/shared/ui/spinner';
import { Textarea } from '@/shared/ui/textarea';

import { useInvalidateVessel } from '../api/queries';
import { useCiiFormat } from '../hooks/use-cii-format';
import { parseDecimal, toInputNumber } from '../lib/decimal';
import { CII_GRADES } from '../lib/grades';
import { ciiProblemKey } from '../lib/problems';
import { CiiProblemState } from './bits';

const NO_GRADE = 'auto';

type Values = {
  attained: string;
  distanceNm: string;
  fuelMeTon: string;
  fuelAeTon: string;
  required: string;
  rating: string;
  grade: string;
  co2Ton: string;
  note: string;
};

const EMPTY: Values = {
  attained: '',
  distanceNm: '',
  fuelMeTon: '',
  fuelAeTon: '',
  required: '',
  rating: '',
  grade: NO_GRADE,
  co2Ton: '',
  note: '',
};

function valuesOf(record: AnnualManualDto | undefined): Values {
  if (!record) return EMPTY;
  return {
    attained: toInputNumber(record.attained),
    distanceNm: toInputNumber(record.distanceNm),
    fuelMeTon: toInputNumber(record.fuelMeTon),
    fuelAeTon: toInputNumber(record.fuelAeTon),
    required: toInputNumber(record.required),
    rating: toInputNumber(record.rating),
    grade: record.grade ?? NO_GRADE,
    co2Ton: toInputNumber(record.co2Ton),
    note: record.note ?? '',
  };
}

function useSchema() {
  const { t } = useTranslation('cii');
  return useMemo(() => {
    const number = (options: { optional: boolean; positive: boolean }) =>
      z
        .string()
        .trim()
        .superRefine((value, ctx) => {
          if (value === '') {
            if (!options.optional)
              ctx.addIssue({ code: 'custom', message: t('manual.errors.required') });
            return;
          }
          const parsed = parseDecimal(value);
          if (Number.isNaN(parsed)) {
            ctx.addIssue({ code: 'custom', message: t('manual.errors.number') });
          } else if (options.positive ? parsed <= 0 : parsed < 0) {
            ctx.addIssue({
              code: 'custom',
              message: options.positive
                ? t('manual.errors.positive')
                : t('manual.errors.nonNegative'),
            });
          }
        });
    return z.object({
      attained: number({ optional: false, positive: true }),
      distanceNm: number({ optional: false, positive: false }),
      fuelMeTon: number({ optional: false, positive: false }),
      fuelAeTon: number({ optional: false, positive: false }),
      required: number({ optional: true, positive: true }),
      rating: number({ optional: true, positive: true }),
      grade: z.string(),
      co2Ton: number({ optional: true, positive: false }),
      note: z.string().max(2000, t('manual.errors.noteLength')),
    });
  }, [t]);
}

function toBody(values: Values): PutAnnualManualDto {
  const optional = (value: string) => (value.trim() === '' ? undefined : parseDecimal(value));
  const body: PutAnnualManualDto = {
    attained: parseDecimal(values.attained),
    distanceNm: parseDecimal(values.distanceNm),
    fuelMeTon: parseDecimal(values.fuelMeTon),
    fuelAeTon: parseDecimal(values.fuelAeTon),
  };
  const required = optional(values.required);
  const rating = optional(values.rating);
  const co2Ton = optional(values.co2Ton);
  if (required !== undefined) body.required = required;
  if (rating !== undefined) body.rating = rating;
  if (co2Ton !== undefined) body.co2Ton = co2Ton;
  if (values.grade !== NO_GRADE) body.grade = values.grade as PutAnnualManualDto['grade'];
  if (values.note.trim()) body.note = values.note.trim();
  return body;
}

const FIELDS: { name: keyof Values; unit: string; required: boolean }[] = [
  { name: 'attained', unit: 'cii', required: true },
  { name: 'distanceNm', unit: 'nm', required: true },
  { name: 'fuelMeTon', unit: 't', required: true },
  { name: 'fuelAeTon', unit: 't', required: true },
  { name: 'required', unit: 'cii', required: false },
  { name: 'rating', unit: '', required: false },
  { name: 'co2Ton', unit: 't', required: false },
];

function ManualForm({
  mmsi,
  year,
  record,
  segmentYear,
  onDone,
}: {
  mmsi: number;
  year: number;
  record: AnnualManualDto | undefined;
  segmentYear: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  const schema = useSchema();
  const invalidate = useInvalidateVessel();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: valuesOf(record) });
  const mutation = useCiiControllerPutManual();

  const submit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync({ mmsi: String(String(mmsi)), year, data: toBody(values) });
      await invalidate(mmsi);
      toast.success(t('manual.saved', { year }));
      onDone();
    } catch (error) {
      if (isApiProblem(error) && error.code === 'VALIDATION_FAILED') {
        for (const [field, message] of Object.entries(error.fieldErrors())) {
          if (field in EMPTY) form.setError(field as keyof Values, { message });
        }
        return;
      }
      const key = ciiProblemKey(error);
      toast.error(key ? t(`problems.${key}.title`, { year }) : t('manual.saveFailed'));
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
        {segmentYear && (
          <Alert variant="info">
            <Info aria-hidden />
            <AlertDescription>{t('manual.segmentYearNote', { year })}</AlertDescription>
          </Alert>
        )}
        {record && (
          <p className="text-xs text-muted-foreground">
            {t('manual.lastUpdated', { time: format.dateTime(record.updatedAt) })}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((item) => (
            <FormField
              key={item.name}
              control={form.control}
              name={item.name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t(`manual.fields.${item.name}`)}
                    {item.unit && (
                      <span className="font-normal text-muted-foreground">
                        {' '}
                        ({item.unit === 'cii' ? t('units.cii') : item.unit})
                      </span>
                    )}
                    {!item.required && (
                      <span className="font-normal text-muted-foreground">
                        {' '}
                        · {t('manual.optional')}
                      </span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="decimal"
                      autoComplete="off"
                      className="font-mono"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <FormField
            control={form.control}
            name="grade"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('manual.fields.grade')}
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    · {t('manual.optional')}
                  </span>
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NO_GRADE}>{t('manual.gradeAuto')}</SelectItem>
                    {CII_GRADES.map((grade) => (
                      <SelectItem key={grade} value={grade}>
                        {grade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('manual.fields.note')}
                <span className="font-normal text-muted-foreground"> · {t('manual.optional')}</span>
              </FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} placeholder={t('manual.notePlaceholder')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <p className="text-xs text-muted-foreground">{t('manual.computedHint')}</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={mutation.isPending}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner />}
            {t('common:actions.save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/**
 * Editor of the manual / imported annual CII of a vessel-year (`PUT …/annual-manual/:year`,
 * vessel:write); the service uses it only for years without counted segments.
 */
export function ManualRecordDialog({
  mmsi,
  open,
  onOpenChange,
  initialYear,
  years,
  segmentYears,
}: {
  mmsi: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialYear: number;
  years: readonly number[];
  /** Years that have counted segments (a manual record is not used there). */
  segmentYears: readonly number[];
}) {
  const { t } = useTranslation('cii');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePenLine className="size-4 text-primary" aria-hidden />
            {t('manual.title')}
          </DialogTitle>
          <DialogDescription>{t('manual.description')}</DialogDescription>
        </DialogHeader>
        {/* Mounted while open only: the year starts from initialYear on every opening. */}
        <ManualDialogBody
          mmsi={mmsi}
          initialYear={initialYear}
          years={years}
          segmentYears={segmentYears}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ManualDialogBody({
  mmsi,
  initialYear,
  years,
  segmentYears,
  onDone,
}: {
  mmsi: number;
  initialYear: number;
  years: readonly number[];
  segmentYears: readonly number[];
  onDone: () => void;
}) {
  const { t } = useTranslation('cii');
  const [year, setYear] = useState(initialYear);
  const record = useCiiControllerGetManual(String(mmsi), year);
  const missing = isApiProblem(record.error) && record.error.code === 'CII_ANNUAL_MANUAL_NOT_FOUND';
  const ready = record.isSuccess || missing;

  return (
    <>
      <div className="flex items-center gap-2">
        <Label htmlFor="cii-manual-year" className="text-sm">
          {t('manual.year')}
        </Label>
        <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
          <SelectTrigger id="cii-manual-year" size="sm" className="w-28 font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((option) => (
              <SelectItem key={option} value={String(option)} className="font-mono">
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {record.isPending ? '' : missing ? t('manual.newRecord') : t('manual.existingRecord')}
        </span>
      </div>
      {record.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : !ready ? (
        <CiiProblemState error={record.error} onRetry={() => void record.refetch()} size="sm" />
      ) : (
        <ManualForm
          key={`${year}-${record.data?.updatedAt ?? 'new'}`}
          mmsi={mmsi}
          year={year}
          record={record.data}
          segmentYear={segmentYears.includes(year)}
          onDone={onDone}
        />
      )}
    </>
  );
}

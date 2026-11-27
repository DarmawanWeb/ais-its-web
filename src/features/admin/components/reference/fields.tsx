import { CircleAlert, CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { formatNumber } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';

import {
  checkFuelFormula,
  FUEL_FORMULA_PREVIEW_SPEEDS as PREVIEW_SPEEDS,
  previewFuelFormula,
} from '@/shared/lib/fuel-formula';

import { formulaProblemMessage } from '../../lib/formula-messages';

interface FieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: ReactNode;
  description?: ReactNode;
  className?: string;
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  mono,
  placeholder,
  maxLength,
}: FieldProps<T> & { mono?: boolean; placeholder?: string; maxLength?: number }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={field.value ?? ''}
              maxLength={maxLength}
              placeholder={placeholder}
              spellCheck={mono ? false : undefined}
              className={cn(mono && 'font-mono')}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  unit,
  step = 'any',
  placeholder,
}: FieldProps<T> & { unit?: string; step?: string; placeholder?: string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <div className="relative">
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                type="number"
                inputMode="decimal"
                step={step}
                placeholder={placeholder}
                className={cn('font-mono tabular-nums', unit && 'pr-16')}
              />
            </FormControl>
            {unit && (
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                {unit}
              </span>
            )}
          </div>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  options,
}: FieldProps<T> & { options: readonly { value: string; label: ReactNode }[] }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function SourceField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
}: FieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea {...field} value={field.value ?? ''} rows={2} maxLength={2000} />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Formula of the safe grammar with live checking, the problem position and a flow preview. */
export function FormulaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
}: FieldProps<T>) {
  const { t, i18n } = useTranslation('admin');
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const source = (field.value as string | undefined) ?? '';
        const check = source ? checkFuelFormula(source) : null;
        const preview = check?.valid ? previewFuelFormula(source) : null;
        return (
          <FormItem className={className}>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                value={source}
                rows={2}
                maxLength={500}
                spellCheck={false}
                className="font-mono text-sm"
                placeholder="-0.0382 * speedKnot ^ 2 + 0.8658 * speedKnot - 0.0197"
              />
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            {check && !check.valid && !fieldState.error && (
              <div className="space-y-1 text-xs text-danger" role="status">
                <p className="flex items-center gap-1.5">
                  <CircleAlert className="size-3.5 shrink-0" aria-hidden />
                  {formulaProblemMessage(t, check.issue)}
                </p>
                <pre className="overflow-x-auto rounded border border-danger/30 bg-danger/5 px-2 py-1 font-mono">
                  {source}
                  {'\n'}
                  {' '.repeat(Math.min(check.issue.position, source.length))}^
                </pre>
              </div>
            )}
            {check?.valid && preview && (
              <div className="space-y-1" role="status">
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <CircleCheck className="size-3.5" aria-hidden /> {t('formula.valid')}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <caption className="sr-only">{t('formula.previewCaption')}</caption>
                    <thead>
                      <tr className="text-muted-foreground">
                        <th scope="row" className="py-1 pr-2 text-left font-medium">
                          {t('formula.speed')}
                        </th>
                        {PREVIEW_SPEEDS.map((speed) => (
                          <th
                            key={speed}
                            scope="col"
                            className="px-1.5 py-1 text-right font-mono font-medium"
                          >
                            {speed}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th
                          scope="row"
                          className="py-1 pr-2 text-left font-medium text-muted-foreground"
                        >
                          {t('formula.flow')}
                        </th>
                        {preview.map((value, index) => (
                          <td
                            key={PREVIEW_SPEEDS[index]}
                            className="px-1.5 py-1 text-right font-mono tabular-nums"
                          >
                            {value === null
                              ? '—'
                              : formatNumber(value, i18n.language, { maximumFractionDigits: 3 })}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

import type { ReactNode } from 'react';
import { type FieldPath, useFormContext } from 'react-hook-form';

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

import type { VesselFormValues } from '../lib/vessel-form';

type Name = FieldPath<VesselFormValues>;

/** Numeric input bound to a `number | null` form value, with an optional unit suffix. */
export function NumberField({
  name,
  label,
  unit,
  description,
  step = 'any',
  hint,
  className,
}: {
  name: Name;
  label: ReactNode;
  unit?: string;
  description?: ReactNode;
  step?: string;
  hint?: ReactNode;
  className?: string;
}) {
  const { control } = useFormContext<VesselFormValues>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('content-start', className)}>
          <FormLabel className="flex items-center gap-1">
            {label}
            {hint}
          </FormLabel>
          <div className="relative">
            <FormControl>
              <Input
                type="number"
                inputMode="decimal"
                step={step}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={
                  typeof field.value === 'number' && Number.isFinite(field.value) ? field.value : ''
                }
                onChange={(event) =>
                  field.onChange(event.target.value === '' ? null : event.target.valueAsNumber)
                }
                className={cn('font-mono tabular-nums', unit && 'pr-12')}
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

/** Text input bound to a string form value. */
export function TextField({
  name,
  label,
  description,
  placeholder,
  mono = false,
  maxLength,
  autoCapitalize,
  className,
}: {
  name: Name;
  label: ReactNode;
  description?: ReactNode;
  placeholder?: string;
  mono?: boolean;
  maxLength?: number;
  autoCapitalize?: 'characters' | 'none' | 'words';
  className?: string;
}) {
  const { control } = useFormContext<VesselFormValues>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('content-start', className)}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={(event) => field.onChange(event.target.value)}
              placeholder={placeholder}
              maxLength={maxLength}
              autoCapitalize={autoCapitalize}
              className={cn(mono && 'font-mono tabular-nums')}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export interface SelectOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
}

/** Select bound to a string form value ('' = nothing chosen; `noneLabel` offers an explicit none). */
export function SelectField({
  name,
  label,
  options,
  placeholder,
  description,
  noneLabel,
  hint,
  className,
}: {
  name: Name;
  label: ReactNode;
  options: readonly SelectOption[];
  placeholder?: string;
  description?: ReactNode;
  noneLabel?: string;
  hint?: ReactNode;
  className?: string;
}) {
  const { control } = useFormContext<VesselFormValues>();
  const NONE = '__none__';
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('content-start', className)}>
          <FormLabel className="flex items-center gap-1">
            {label}
            {hint}
          </FormLabel>
          <Select
            name={field.name}
            value={
              typeof field.value === 'string' && field.value !== ''
                ? field.value
                : noneLabel
                  ? NONE
                  : ''
            }
            onValueChange={(value) => field.onChange(value === NONE ? '' : value)}
          >
            <FormControl>
              <SelectTrigger ref={field.ref} onBlur={field.onBlur} className="w-full">
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
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

/** A titled group of form fields (renders an h2). */
export function FormSection({
  id,
  title,
  description,
  actions,
  children,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-20 rounded-xl border bg-surface p-5 shadow-xs"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id={`${id}-title`} className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

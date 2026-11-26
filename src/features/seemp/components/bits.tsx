import { CII_GRADE_LABELS } from '@darmawanweb/ais-its-contracts/domain';
import {
  ArrowRight,
  Cog,
  Fuel,
  type LucideIcon,
  SearchX,
  ShieldX,
  Ship,
  Sun,
  Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { MethodChips as SharedMethodChips } from '@/shared/domain-ui/method-chips';
import { cn } from '@/shared/lib/utils';
import { gradeClassName } from '@/shared/theme/grade';
import { Badge } from '@/shared/ui/badge';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useEmissionMethodName } from '@/shared/methodology';

import { type CiiGrade, gradeSteps } from '../lib/grade-style';
import type { MeasureCategory } from '../lib/measures';
import { seempProblemKey } from '../lib/problems';

/** CII grade letter on its IMO colour (contrast-safe text) with the label as accessible text. */
export function GradeChip({
  grade,
  size = 'md',
  showLabel = false,
  className,
}: {
  grade: CiiGrade | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}) {
  const { t, i18n } = useTranslation('seemp');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  if (!grade) {
    return (
      <span className={cn('text-muted-foreground', className)}>
        —<span className="sr-only">{t('grade.none')}</span>
      </span>
    );
  }
  const label = CII_GRADE_LABELS[grade][locale];
  return (
    <span className={cn('inline-flex items-center gap-2', className)} title={label}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md font-bold shadow-xs ring-1 ring-black/10 ring-inset',
          gradeClassName(grade),
          size === 'sm' && 'size-5 text-[11px]',
          size === 'md' && 'size-7 text-sm',
          size === 'lg' && 'size-11 text-xl',
        )}
      >
        <span aria-hidden>{grade}</span>
        <span className="sr-only">{t('grade.aria', { grade, label })}</span>
      </span>
      {showLabel && <span className="text-sm text-muted-foreground">{label}</span>}
    </span>
  );
}

/** Grade before → after with the number of grades gained (text, not colour alone). */
export function GradeChange({
  before,
  after,
  size = 'sm',
}: {
  before: CiiGrade | null;
  after: CiiGrade | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { t } = useTranslation('seemp');
  const steps = gradeSteps(before, after);
  return (
    <span className="inline-flex items-center gap-1.5">
      <GradeChip grade={before} size={size} />
      <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
      <span className="sr-only">{t('grade.to')}</span>
      <GradeChip grade={after} size={size} />
      {steps !== null && steps !== 0 && (
        <span className={cn('text-xs font-medium', steps > 0 ? 'text-success' : 'text-danger')}>
          {t(steps > 0 ? 'grade.up' : 'grade.down', { count: Math.abs(steps) })}
        </span>
      )}
    </span>
  );
}

const CATEGORY_ICON: Record<MeasureCategory, LucideIcon> = {
  technical: Wrench,
  operational: Cog,
  fuel: Fuel,
  energy: Sun,
};

export function CategoryBadge({ category, className }: { category: string; className?: string }) {
  const { t } = useTranslation('seemp');
  const Icon = CATEGORY_ICON[category as MeasureCategory] ?? Cog;
  return (
    <Badge variant="muted" className={className}>
      <Icon aria-hidden /> {t(`categories.${category}`, { defaultValue: category })}
    </Badge>
  );
}

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = CATEGORY_ICON[category as MeasureCategory] ?? Cog;
  return <Icon className={className} aria-hidden />;
}

/** Year picker with an "automatic" choice (the service default). */
export function YearPicker({
  id,
  label,
  value,
  years,
  autoLabel,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  years: readonly number[];
  autoLabel: string;
  onChange: (year: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-xs whitespace-nowrap text-muted-foreground">
        {label}
      </Label>
      <Select
        value={value === null ? 'auto' : String(value)}
        onValueChange={(next) => onChange(next === 'auto' ? null : Number(next))}
      >
        <SelectTrigger id={id} size="sm" className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{autoLabel}</SelectItem>
          {years.map((year) => (
            <SelectItem key={year} value={String(year)} className="font-mono">
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Chips naming the methodology entries behind a figure, each with its ⓘ popover. */
export function MethodChips({
  methodIds,
  className,
}: {
  methodIds: readonly string[];
  className?: string;
}) {
  const { t } = useTranslation('seemp');
  const nameOf = useEmissionMethodName();
  return (
    <SharedMethodChips
      methodIds={methodIds}
      label={t('methodsUsed')}
      nameOf={nameOf}
      className={className}
    />
  );
}

/** Translated state of an emission service problem; generic `<ErrorState>` otherwise. */
export function SeempProblemState({
  error,
  onRetry,
  action,
  size = 'default',
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  action?: ReactNode;
  size?: 'default' | 'sm';
  className?: string;
}) {
  const { t } = useTranslation('seemp');
  const key = seempProblemKey(error);
  if (!key) return <ErrorState error={error} onRetry={onRetry} size={size} className={className} />;
  const title = t(`problems.${key}.title`);
  const description = t(`problems.${key}.description`);
  if (key === 'notAvailable' || key === 'vesselNotFound' || key === 'scenarioNotFound') {
    return (
      <EmptyState
        icon={key === 'notAvailable' ? Ship : SearchX}
        title={title}
        description={description}
        action={action}
        size={size}
        className={className}
      />
    );
  }
  if (key === 'forbidden') {
    return (
      <EmptyState
        icon={ShieldX}
        title={title}
        description={description}
        size={size}
        className={className}
      />
    );
  }
  return (
    <ErrorState
      error={error}
      title={title}
      description={description}
      onRetry={onRetry}
      action={action}
      size={size}
      className={className}
    />
  );
}

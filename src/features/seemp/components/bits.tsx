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
import { CiiGradeBadge } from '@/shared/domain-ui/badges';
import { YearSelect } from '@/shared/domain-ui/year-select';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { useEmissionMethodName } from '@/shared/methodology';

import { type CiiGrade, gradeSteps } from '../lib/grade-style';
import type { MeasureCategory } from '../lib/measures';
import { seempProblemKey } from '../lib/problems';

/** CII grade letter on its IMO colour (contrast-safe text) with the label as accessible text. */
/** The CII grade chip of the SEEMP pages: the shared badge. */
export const GradeChip = CiiGradeBadge;

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
/** Year picker with an "automatic" entry (`null`): the shared `YearSelect`. */
export function YearPicker(props: {
  id: string;
  label: string;
  value: number | null;
  years: readonly number[];
  autoLabel: string;
  onChange: (year: number | null) => void;
}) {
  return <YearSelect {...props} />;
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

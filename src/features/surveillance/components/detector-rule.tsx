import { FilterX, Radar, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/domain-ui/feedback';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

import { useDetectorThresholds } from '../hooks/use-detector';
import { useRuleValues } from '../hooks/use-rule-values';
import { TYPE_METHOD, type SurveillanceType } from '../lib/types';
import { MethodChips } from '@/shared/domain-ui/method-chips';

/**
 * What a detector looks for, with the thresholds the service runs with (`GET /surveillance/
 * detectors`) and the method popovers of its catalog ids.
 */
export function DetectorRuleCard({
  type,
  className,
  children,
}: {
  type: SurveillanceType;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation('surveillance');
  const thresholds = useDetectorThresholds(type);
  const values = useRuleValues(type, thresholds);
  const methodIds = thresholds.detector?.methodIds?.length
    ? thresholds.detector.methodIds
    : [TYPE_METHOD[type]];
  return (
    <section
      aria-labelledby={`rule-${type}`}
      className={cn(
        'relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/8 via-surface to-surface p-4 shadow-xs',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Radar className="size-4" aria-hidden />
          </span>
          <h2 id={`rule-${type}`} className="text-sm font-semibold">
            {t('rule.title')}
          </h2>
        </div>
        {!thresholds.enabled && (
          <Badge variant="warning" className="gap-1">
            <TriangleAlert className="size-3" aria-hidden /> {t('rule.disabled')}
          </Badge>
        )}
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {t(`rule.${type}`, values)}
      </p>
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border/60 pt-3">
        <span className="text-xs font-medium text-muted-foreground">{t('rule.methods')}</span>
        <MethodChips methodIds={methodIds} limit={4} />
      </div>
    </section>
  );
}

/**
 * Empty list of a detector: says what the detector looks for and how to widen the search.
 */
export function DetectorEmptyState({
  type,
  filtered,
  onReset,
  icon,
}: {
  type: SurveillanceType;
  filtered: boolean;
  onReset?: () => void;
  icon?: typeof Radar;
}) {
  const { t } = useTranslation('surveillance');
  const thresholds = useDetectorThresholds(type);
  const values = useRuleValues(type, thresholds);
  return (
    <EmptyState
      icon={filtered ? FilterX : (icon ?? Radar)}
      title={filtered ? t('empty.filteredTitle') : t(`empty.${type}.title`)}
      description={
        <>
          <span className="block">{t(`rule.${type}`, values)}</span>
          <span className="mt-2 block">{filtered ? t('empty.filteredHint') : t('empty.hint')}</span>
        </>
      }
      action={
        filtered && onReset ? (
          <Button variant="outline" size="sm" onClick={onReset}>
            {t('filters.resetAll')}
          </Button>
        ) : undefined
      }
    />
  );
}

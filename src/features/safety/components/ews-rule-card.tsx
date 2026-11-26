import { ExternalLink, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { MethodInfo } from '@/shared/domain-ui/method-info';
import { formatNumber } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useMethodCatalog } from '@/shared/methodology';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';

import type { EwsThresholds } from '../lib/thresholds';

const METHOD_ID = 'ews.pipeline_distance_status';

/**
 * How the EWS rule works (spec §17): the catalog summary, the thresholds the detector runs with
 * (`GET /safety/detectors`, else the catalog defaults) and the sources of each threshold.
 */
export function EwsRuleCard({
  thresholds,
  className,
}: {
  thresholds: EwsThresholds;
  className?: string;
}) {
  const { t, i18n } = useTranslation('safety');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const catalog = useMethodCatalog();
  const method = catalog.data?.getMethod(METHOD_ID);
  const referenceIds = [
    ...new Set((method?.constants ?? []).flatMap((constant) => constant.referenceIds)),
  ];
  const references = referenceIds
    .map((id) => catalog.data?.getReference(id))
    .filter((reference) => reference !== undefined);
  const number = (value: number) =>
    formatNumber(value, i18n.language, { maximumFractionDigits: 0 });

  const bands = [
    {
      key: 'danger',
      code: 0,
      label: t('ews.status.danger'),
      rule: t('ews.rule.below', { meters: number(thresholds.dangerM) }),
      tone: 'border-danger/35 bg-danger/10 text-danger',
    },
    {
      key: 'warning',
      code: 1,
      label: t('ews.status.warning'),
      rule: t('ews.rule.below', { meters: number(thresholds.warningM) }),
      tone: 'border-warning/35 bg-warning/10 text-warning',
    },
    {
      key: 'safe',
      code: 3,
      label: t('ews.status.safe'),
      rule: t('ews.rule.atLeast', { meters: number(thresholds.warningM) }),
      tone: 'border-success/35 bg-success/10 text-success',
    },
  ];

  return (
    <section
      aria-labelledby="ews-rule-title"
      className={cn('flex flex-col gap-4 rounded-xl border bg-surface p-4 shadow-xs', className)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 id="ews-rule-title" className="flex items-center gap-1.5 text-base font-semibold">
            {t('ews.rule.title')}
            <MethodInfo methodId={METHOD_ID} />
          </h2>
          <p className="text-sm text-muted-foreground">
            {method ? method.summary[locale] : t('ews.rule.fallbackSummary')}
          </p>
        </div>
        <Badge
          variant={thresholds.source === 'detector' ? 'success' : 'muted'}
          className="shrink-0"
        >
          {thresholds.source === 'detector'
            ? t('ews.rule.activeThresholds')
            : t('ews.rule.defaultThresholds')}
        </Badge>
      </div>

      <ol className="grid gap-2 sm:grid-cols-3" aria-label={t('ews.rule.bands')}>
        {bands.map((band) => (
          <li key={band.key} className={cn('rounded-lg border px-3 py-2.5', band.tone)}>
            <p className="flex items-center justify-between gap-2 text-sm font-semibold">
              {band.label}
              <span className="font-mono text-xs">{t('ews.rule.code', { code: band.code })}</span>
            </p>
            <p className="mt-0.5 text-xs font-medium text-foreground">{band.rule}</p>
          </li>
        ))}
      </ol>

      <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {t('ews.rule.anchoredOnly')}{' '}
          <MethodInfo methodId="navstatus.prediction" className="align-middle" />
        </span>
      </p>

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t('ews.rule.sources')}
          {method?.needsCitation && (
            <Badge variant="warning">{t('common:method.needsCitation')}</Badge>
          )}
        </h3>
        {catalog.isPending ? (
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : references.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('ews.rule.sourcesPending')}</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {references.map((reference) => (
              <li key={reference.id} className="flex items-start gap-1.5">
                <span
                  className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0">
                  {reference.url ? (
                    <a
                      href={reference.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-medium text-primary hover:underline"
                    >
                      {reference.title}
                      <ExternalLink className="ml-1 inline size-3 align-[-1px]" aria-hidden />
                      <span className="sr-only"> {t('ews.rule.opensInNewTab')}</span>
                    </a>
                  ) : (
                    <span className="font-medium">{reference.title}</span>
                  )}
                  <span className="text-muted-foreground">
                    {' '}
                    — {reference.issuerOrAuthors}
                    {reference.year ? ` (${reference.year})` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

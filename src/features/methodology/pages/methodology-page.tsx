import type { Method } from '@darmawanweb/ais-its-contracts/references';
import { ArrowUpRight, BookOpenText, Search, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { cn } from '@/shared/lib/utils';
import { Formula, useMethodCatalog, type MethodCatalog } from '@/shared/methodology';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

function MethodCard({
  method,
  catalog,
  highlighted,
}: {
  method: Method;
  catalog: MethodCatalog;
  highlighted: boolean;
}) {
  const { t, i18n } = useTranslation('methodology');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const references = catalog.referencesOfMethod(method.id);
  return (
    <article
      id={method.id}
      className={cn(
        'scroll-mt-24 rounded-xl border bg-surface p-5 shadow-xs transition-shadow',
        highlighted && 'ring-2 ring-primary/60',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 className="font-semibold">{method.name[locale]}</h3>
          <p className="font-mono text-xs text-muted-foreground">{method.id}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="muted">{catalog.labels.status(method.status, locale)}</Badge>
          {method.needsCitation && (
            <Badge variant="warning">
              <TriangleAlert /> {t('common:method.needsCitation')}
            </Badge>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{method.summary[locale]}</p>
      {method.formulaLatex && (
        <div className="mt-3 rounded-lg border bg-muted/30 px-4 py-2">
          <Formula latex={method.formulaLatex} />
        </div>
      )}
      {references.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('references')}
          </p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {references.map((reference) => (
              <li key={reference.id}>
                {reference.url ? (
                  <a
                    href={reference.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline-offset-2 hover:text-primary hover:underline"
                  >
                    {reference.title}
                    <ArrowUpRight className="ml-0.5 inline size-3" aria-hidden />
                  </a>
                ) : (
                  reference.title
                )}
                <span className="text-muted-foreground">
                  {' — '}
                  {reference.issuerOrAuthors}
                  {reference.year ? ` (${reference.year})` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

/** Methodology & references (scaffold): catalog by domain with KaTeX formulas and anchors. */
export function MethodologyPage() {
  const { t, i18n } = useTranslation('methodology');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const { hash } = useLocation();
  const catalogQuery = useMethodCatalog();
  const catalog = catalogQuery.data;
  const [domain, setDomain] = useState('all');
  const [query, setQuery] = useState('');
  const term = useDebouncedValue(query.trim().toLowerCase(), 200);
  const anchor = decodeURIComponent(hash.replace(/^#/, ''));

  const domains = useMemo(
    () => [...new Set(catalog?.methods.map((method) => method.domain) ?? [])],
    [catalog],
  );
  const methods = useMemo(
    () =>
      (catalog?.methods ?? []).filter(
        (method) =>
          (domain === 'all' || method.domain === domain) &&
          (!term ||
            method.id.includes(term) ||
            method.name[locale].toLowerCase().includes(term) ||
            method.summary[locale].toLowerCase().includes(term)),
      ),
    [catalog, domain, term, locale],
  );

  useEffect(() => {
    if (!anchor || !catalog) return;
    document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
  }, [anchor, catalog]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.knowledge')}
        icon={BookOpenText}
        title={t('title')}
        description={t('description')}
      />
      {catalogQuery.isPending ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : catalogQuery.isError ? (
        <ErrorState error={catalogQuery.error} onRetry={() => void catalogQuery.refetch()} />
      ) : !catalog ? (
        <EmptyState
          icon={BookOpenText}
          title={t('pending')}
          description={t('pendingDescription')}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative lg:w-80">
              <Search
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('search')}
                aria-label={t('search')}
                className="pl-9"
              />
            </div>
            <ToggleGroup
              type="single"
              value={domain}
              onValueChange={(value) => setDomain(value || 'all')}
              className="flex-wrap"
              aria-label={t('allDomains')}
            >
              <ToggleGroupItem value="all">{t('allDomains')}</ToggleGroupItem>
              {domains.map((value) => (
                <ToggleGroupItem key={value} value={value}>
                  {catalog.labels.domain(value, locale)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <span className="text-sm text-muted-foreground lg:ml-auto">
              {t('methods', { count: methods.length })}
            </span>
          </div>
          {methods.length === 0 ? (
            <EmptyState icon={Search} title={t('noResults')} size="sm" />
          ) : (
            <div className="grid gap-4 2xl:grid-cols-2">
              {methods.map((method) => (
                <MethodCard
                  key={method.id}
                  method={method}
                  catalog={catalog}
                  highlighted={method.id === anchor}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { BookOpenText, Library, Printer, Search, Server, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { useMethodologyControllerDescribe } from '@/shared/api/generated/emission/methodology/methodology';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { cn } from '@/shared/lib/utils';
import { type MethodCatalog, useMethodCatalog } from '@/shared/methodology';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';
import { Switch } from '@/shared/ui/switch';

import { Bibliography } from '../components/bibliography';
import { MethodCard } from '../components/method-card';
import { ServiceParameters } from '../components/service-parameters';
import {
  catalogStats,
  citingMethods,
  type DisplayMethod,
  filterMethods,
  isFiltered,
  mergeMethods,
  NO_METHOD_FILTER,
  orderedDomains,
  valuesOf,
} from '../lib/catalog';

/**
 * Print layout: only the page content (no shell), light colours on paper, every card whole.
 * Rendered by this page only, so it never affects other pages.
 */
const PRINT_CSS = `
@media print {
  @page { margin: 14mm; }
  body * { visibility: hidden !important; }
  #methodology-print, #methodology-print * { visibility: visible !important; }
  #methodology-print {
    position: absolute; left: 0; top: 0; width: 100%;
    --background: #fff; --foreground: #111827; --surface: #fff; --elevated: #fff;
    --muted: #f3f4f6; --muted-foreground: #4b5563; --border: #d1d5db;
    --primary: #0b5c8a; --success: #166534; --warning: #92400e; --danger: #991b1b; --info: #1e40af;
    color: var(--foreground); background: #fff;
  }
}
`;

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border bg-surface px-4 py-3 shadow-xs print:shadow-none">
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p className="font-mono text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Contents({
  domains,
  counts,
  label,
  showService,
}: {
  domains: readonly string[];
  counts: ReadonlyMap<string, number>;
  label: (domain: string) => string;
  showService: boolean;
}) {
  const { t } = useTranslation('methodology');
  const link =
    'flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';
  return (
    <nav aria-label={t('contents')} className="print:hidden">
      <p className="mb-2 px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {t('contents')}
      </p>
      <ul className="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
        {domains.map((domain) => (
          <li key={domain}>
            <a href={`#domain-${domain}`} className={link}>
              <span className="truncate">{label(domain)}</span>
              <span className="font-mono text-xs tabular-nums">{counts.get(domain) ?? 0}</span>
            </a>
          </li>
        ))}
        <li>
          <a href="#bibliography" className={link}>
            <span className="inline-flex items-center gap-1.5">
              <Library className="size-3.5" aria-hidden /> {t('bibliography')}
            </span>
          </a>
        </li>
        {showService && (
          <li>
            <a href="#service-parameters" className={link}>
              <span className="inline-flex items-center gap-1.5">
                <Server className="size-3.5" aria-hidden /> {t('service.title')}
              </span>
            </a>
          </li>
        )}
      </ul>
    </nav>
  );
}

function MethodSections({
  catalog,
  methods,
  locale,
  anchor,
  domainLabel,
}: {
  catalog: MethodCatalog;
  methods: readonly DisplayMethod[];
  locale: 'id' | 'en';
  anchor: string;
  domainLabel: (domain: string) => string;
}) {
  const { t } = useTranslation('methodology');
  const references = useMemo(
    () => new Map(catalog.references.map((reference) => [reference.id, reference])),
    [catalog],
  );
  return (
    <>
      {orderedDomains(methods).map((domain) => {
        const items = methods.filter((method) => method.domain === domain);
        return (
          <section
            key={domain}
            id={`domain-${domain}`}
            aria-labelledby={`domain-${domain}-title`}
            className="flex scroll-mt-20 flex-col gap-3"
          >
            <h2
              id={`domain-${domain}-title`}
              className="flex items-baseline gap-2 text-lg font-semibold tracking-tight"
            >
              {domainLabel(domain)}
              <span className="text-sm font-normal text-muted-foreground">
                {t('methods', { count: items.length })}
              </span>
            </h2>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 2xl:grid-cols-[repeat(2,minmax(0,1fr))]">
              {items.map((method) => (
                <MethodCard
                  key={method.id}
                  method={method}
                  references={references}
                  locale={locale}
                  highlighted={method.id === anchor}
                />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

/** Methodology & references (spec §17): every method by domain with sources, and the bibliography. */
export function MethodologyPage() {
  const { t, i18n } = useTranslation('methodology');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const { hash } = useLocation();
  const anchor = decodeURIComponent(hash.replace(/^#/, ''));
  const catalogQuery = useMethodCatalog();
  const service = useMethodologyControllerDescribe({
    query: { staleTime: 10 * 60_000, retry: false },
  });
  const catalog = catalogQuery.data;
  const [filter, setFilter] = useState(NO_METHOD_FILTER);
  const term = useDebouncedValue(filter.term, 200);

  const methods = useMemo(
    () =>
      catalog
        ? mergeMethods(
            catalog.methods,
            service.data?.methods ?? [],
            service.data?.service ?? 'emission',
          )
        : [],
    [catalog, service.data],
  );
  const citing = useMemo(() => citingMethods(methods), [methods]);
  const filtered = useMemo(
    () => filterMethods(methods, { ...filter, term }),
    [methods, filter, term],
  );
  // A deep link (#<methodId>) always shows its method, whatever the filters.
  const anchored = methods.some((method) => method.id === anchor);
  const visible = anchored && !filtered.some((method) => method.id === anchor) ? methods : filtered;
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const method of visible) map.set(method.domain, (map.get(method.domain) ?? 0) + 1);
    return map;
  }, [visible]);
  const stats = catalog ? catalogStats(methods, catalog.references) : null;
  const statuses = useMemo(() => valuesOf(methods, 'status'), [methods]);
  const allDomains = useMemo(() => orderedDomains(methods), [methods]);
  const domainLabel = (domain: string) =>
    t(`domains.${domain}`, { defaultValue: catalog?.labels.domain(domain, locale) ?? domain });

  useEffect(() => {
    if (!anchor || methods.length === 0) return;
    const element = document.getElementById(anchor);
    if (!element) return;
    element.scrollIntoView({ block: 'start' });
    element.focus({ preventScroll: true });
  }, [anchor, methods.length]);

  return (
    <div id="methodology-print" className="flex flex-col gap-6">
      <style>{PRINT_CSS}</style>
      <PageHeader
        eyebrow={t('common:nav.sections.knowledge')}
        icon={BookOpenText}
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="print:hidden"
          >
            <Printer /> {t('print')}
          </Button>
        }
      />
      {catalogQuery.isPending ? (
        <div className="grid gap-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : catalogQuery.isError ? (
        <ErrorState error={catalogQuery.error} onRetry={() => void catalogQuery.refetch()} />
      ) : !catalog || !stats ? (
        <EmptyState
          icon={BookOpenText}
          title={t('pending')}
          description={t('pendingDescription')}
        />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3">
            <StatTile
              label={t('stats.methods')}
              value={String(stats.methods)}
              hint={t('stats.domains', { count: stats.domains })}
            />
            <StatTile
              label={t('stats.implemented')}
              value={String(stats.implemented)}
              hint={t('stats.ofMethods', { count: stats.methods })}
            />
            <StatTile
              label={t('stats.needsCitation')}
              value={String(stats.needsCitation)}
              hint={t('stats.needsCitationHint')}
            />
            <StatTile
              label={t('stats.references')}
              value={String(stats.references)}
              hint={t('stats.referencesHint')}
            />
            <StatTile
              label={t('stats.verified')}
              value={`${Math.round(stats.verifiedShare * 100)}%`}
              hint={t('stats.verifiedHint', { count: stats.verified })}
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-20 lg:self-start">
              <Contents
                domains={allDomains}
                counts={counts}
                label={domainLabel}
                showService={!!service.data}
              />
            </aside>
            <div className="flex min-w-0 flex-col gap-8">
              <div className="flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-xs print:hidden">
                <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-end">
                  <div className="relative xl:min-w-80 xl:flex-1">
                    <Label htmlFor="methodology-search" className="sr-only">
                      {t('search')}
                    </Label>
                    <Search
                      className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="methodology-search"
                      type="search"
                      value={filter.term}
                      onChange={(event) =>
                        setFilter((current) => ({ ...current, term: event.target.value }))
                      }
                      placeholder={t('search')}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="methodology-domain"
                      className="text-xs whitespace-nowrap text-muted-foreground"
                    >
                      {t('domain')}
                    </Label>
                    <Select
                      value={filter.domain}
                      onValueChange={(domain) => setFilter((current) => ({ ...current, domain }))}
                    >
                      <SelectTrigger id="methodology-domain" size="sm" className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('allDomains')}</SelectItem>
                        {allDomains.map((domain) => (
                          <SelectItem key={domain} value={domain}>
                            {domainLabel(domain)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="methodology-status"
                      className="text-xs whitespace-nowrap text-muted-foreground"
                    >
                      {t('statusFilter')}
                    </Label>
                    <Select
                      value={filter.status}
                      onValueChange={(status) => setFilter((current) => ({ ...current, status }))}
                    >
                      <SelectTrigger id="methodology-status" size="sm" className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('allStatuses')}</SelectItem>
                        {statuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {t(`status.${status}`, { defaultValue: status })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="methodology-citation"
                      checked={filter.needsCitation}
                      onCheckedChange={(needsCitation) =>
                        setFilter((current) => ({ ...current, needsCitation }))
                      }
                    />
                    <Label
                      htmlFor="methodology-citation"
                      className="inline-flex items-center gap-1 text-sm"
                    >
                      <TriangleAlert className="size-3.5 text-warning" aria-hidden />{' '}
                      {t('onlyNeedsCitation')}
                    </Label>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <p aria-live="polite">
                    {t('methodsShown', { count: visible.length, total: methods.length })}
                  </p>
                  {isFiltered(filter) && (
                    <Button variant="ghost" size="xs" onClick={() => setFilter(NO_METHOD_FILTER)}>
                      {t('clearFilters')}
                    </Button>
                  )}
                </div>
              </div>

              {service.isError && (
                <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground print:hidden">
                  {t('serviceUnavailable')}
                </p>
              )}

              {visible.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title={t('noResults')}
                  description={t('noResultsDescription')}
                  action={
                    <Button size="sm" variant="outline" onClick={() => setFilter(NO_METHOD_FILTER)}>
                      {t('clearFilters')}
                    </Button>
                  }
                />
              ) : (
                <MethodSections
                  catalog={catalog}
                  methods={visible}
                  locale={locale}
                  anchor={anchor}
                  domainLabel={domainLabel}
                />
              )}

              <section
                id="bibliography"
                aria-labelledby="bibliography-title"
                className={cn(
                  'flex scroll-mt-20 flex-col gap-3 border-t pt-6 print:break-before-page',
                )}
              >
                <div className="space-y-1">
                  <h2
                    id="bibliography-title"
                    className="flex items-center gap-2 text-lg font-semibold tracking-tight"
                  >
                    <Library className="size-5 text-primary" aria-hidden /> {t('bibliography')}
                  </h2>
                  <p className="text-sm text-muted-foreground">{t('bibliographyDescription')}</p>
                </div>
                <Bibliography
                  catalog={catalog}
                  methods={methods}
                  citing={citing}
                  locale={locale}
                  anchor={anchor}
                />
              </section>

              {service.data && (
                <section
                  id="service-parameters"
                  aria-labelledby="service-parameters-title"
                  className="flex scroll-mt-20 flex-col gap-3 border-t pt-6"
                >
                  <div className="space-y-1">
                    <h2
                      id="service-parameters-title"
                      className="flex items-center gap-2 text-lg font-semibold tracking-tight"
                    >
                      <Server className="size-5 text-primary" aria-hidden /> {t('service.title')}
                    </h2>
                    <p className="text-sm text-muted-foreground">{t('service.description')}</p>
                  </div>
                  <ServiceParameters data={service.data} />
                </section>
              )}
              <p className="text-xs text-muted-foreground">
                {t(catalog.source === 'contracts' ? 'sourceContracts' : 'sourceJson')}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

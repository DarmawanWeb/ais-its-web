import type { Reference } from '@darmawanweb/ais-its-contracts/references';
import { ArrowUpRight, Search } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/domain-ui/feedback';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { cn } from '@/shared/lib/utils';
import type { MethodCatalog } from '@/shared/methodology';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { CopyButton } from '@/shared/ui/copy-button';

import {
  type DisplayMethod,
  filterReferences,
  formatCitation,
  NO_REFERENCE_FILTER,
  type ReferenceFilter,
  sortReferences,
  valuesOf,
} from '../lib/catalog';
import { VerificationBadge } from './badges';

const MAX_CITING = 6;

const ReferenceItem = memo(function ReferenceItem({
  reference,
  citing,
  methodNames,
  typeLabel,
  highlighted,
}: {
  reference: Reference;
  citing: readonly string[];
  methodNames: ReadonlyMap<string, string>;
  typeLabel: string;
  highlighted: boolean;
}) {
  const { t } = useTranslation('methodology');
  const [allCiting, setAllCiting] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const shown = allCiting ? citing : citing.slice(0, MAX_CITING);
  const citation = formatCitation(reference, t('accessed'));
  return (
    <li
      id={`ref-${reference.id}`}
      tabIndex={-1}
      className={cn(
        'min-w-0 scroll-mt-24 rounded-xl border bg-surface p-4 outline-none print:break-inside-avoid',
        highlighted && 'ring-2 ring-primary/70',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 leading-snug font-medium break-words">
          {reference.url ? (
            <a
              href={reference.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary hover:underline"
            >
              {reference.title}
              <ArrowUpRight className="ml-0.5 inline size-3.5" aria-hidden />
              <span className="sr-only"> ({t('opensInNewTab')})</span>
            </a>
          ) : (
            reference.title
          )}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{typeLabel}</Badge>
          <VerificationBadge verification={reference.verification} />
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {reference.issuerOrAuthors}
        {reference.year ? ` (${reference.year})` : ''}
      </p>
      {reference.identifier && (
        <p className="mt-0.5 text-xs break-words text-muted-foreground">{reference.identifier}</p>
      )}
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <code className="font-mono">{reference.id}</code>
        {reference.license && <span>{reference.license}</span>}
        {reference.accessed && <span>{t('accessedOn', { date: reference.accessed })}</span>}
      </p>
      {reference.notes && (
        <div className="mt-2 text-sm text-muted-foreground">
          <p className={cn(!notesOpen && 'line-clamp-2 print:line-clamp-none')}>
            {reference.notes}
          </p>
          {reference.notes.length > 180 && (
            <Button
              type="button"
              variant="link"
              size="xs"
              className="h-auto px-0 print:hidden"
              aria-expanded={notesOpen}
              onClick={() => setNotesOpen((value) => !value)}
            >
              {notesOpen ? t('showLess') : t('showMore')}
            </Button>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {citing.length > 0 ? (
          <p className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
            <span className="text-muted-foreground">{t('citedBy', { count: citing.length })}</span>
            {shown.map((id) => (
              <a
                key={id}
                href={`#${id}`}
                className="max-w-60 truncate rounded-md border bg-muted/40 px-1.5 py-0.5 hover:border-primary/50 hover:text-primary"
              >
                {methodNames.get(id) ?? id}
              </a>
            ))}
            {citing.length > MAX_CITING && (
              <Button
                type="button"
                variant="link"
                size="xs"
                className="h-auto px-1 print:hidden"
                onClick={() => setAllCiting((value) => !value)}
              >
                {allCiting
                  ? t('showLess')
                  : t('moreMethods', { count: citing.length - MAX_CITING })}
              </Button>
            )}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('notCited')}</p>
        )}
        <CopyButton
          value={citation}
          label={t('copyCitation')}
          successMessage={t('citationCopied')}
          variant="ghost"
          size="xs"
          className="text-muted-foreground hover:text-foreground"
        >
          {t('copyCitation')}
        </CopyButton>
      </div>
    </li>
  );
});

/** Bibliography (REFERENCES) with search, type and verification filters and copy-citation. */
export function Bibliography({
  catalog,
  methods,
  citing,
  locale,
  anchor,
}: {
  catalog: MethodCatalog;
  methods: readonly DisplayMethod[];
  citing: ReadonlyMap<string, string[]>;
  locale: 'id' | 'en';
  anchor: string;
}) {
  const { t } = useTranslation('methodology');
  const [filter, setFilter] = useState<ReferenceFilter>(NO_REFERENCE_FILTER);
  const term = useDebouncedValue(filter.term, 200);
  const all = useMemo(() => sortReferences(catalog.references), [catalog]);
  const types = useMemo(() => valuesOf(catalog.references, 'type'), [catalog]);
  const verifications = useMemo(() => valuesOf(catalog.references, 'verification'), [catalog]);
  const methodNames = useMemo(
    () => new Map(methods.map((method) => [method.id, method.name[locale]])),
    [methods, locale],
  );
  // A deep link to a reference must not be hidden by a filter.
  const target = anchor.startsWith('ref-') ? anchor.slice(4) : null;
  const shown = useMemo(() => filterReferences(all, { ...filter, term }), [all, filter, term]);
  const visible = target && !shown.some((reference) => reference.id === target) ? all : shown;
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const reference of catalog.references) {
      map.set(reference.verification, (map.get(reference.verification) ?? 0) + 1);
    }
    return map;
  }, [catalog]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end print:hidden">
        <div className="relative lg:w-80">
          <Label htmlFor="bibliography-search" className="sr-only">
            {t('referenceSearch')}
          </Label>
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="bibliography-search"
            type="search"
            value={filter.term}
            onChange={(event) => setFilter((current) => ({ ...current, term: event.target.value }))}
            placeholder={t('referenceSearch')}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label
            htmlFor="bibliography-type"
            className="text-xs whitespace-nowrap text-muted-foreground"
          >
            {t('referenceType')}
          </Label>
          <Select
            value={filter.type}
            onValueChange={(type) => setFilter((current) => ({ ...current, type }))}
          >
            <SelectTrigger id="bibliography-type" size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allTypes')}</SelectItem>
              {types.map((type) => (
                <SelectItem key={type} value={type}>
                  {catalog.labels.referenceType(type, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label
            htmlFor="bibliography-verification"
            className="text-xs whitespace-nowrap text-muted-foreground"
          >
            {t('verificationFilter')}
          </Label>
          <Select
            value={filter.verification}
            onValueChange={(verification) => setFilter((current) => ({ ...current, verification }))}
          >
            <SelectTrigger id="bibliography-verification" size="sm" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allVerifications')}</SelectItem>
              {verifications.map((verification) => (
                <SelectItem key={verification} value={verification}>
                  {t(`verification.${verification}`, { defaultValue: verification })} (
                  {counts.get(verification) ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p
          className="text-sm whitespace-nowrap text-muted-foreground lg:ml-auto"
          aria-live="polite"
        >
          {t('referencesShown', { count: visible.length, total: all.length })}
        </p>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          icon={Search}
          size="sm"
          title={t('noReferences')}
          description={t('noReferencesDescription')}
          action={
            <Button size="sm" variant="outline" onClick={() => setFilter(NO_REFERENCE_FILTER)}>
              {t('clearFilters')}
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 2xl:grid-cols-[repeat(2,minmax(0,1fr))]">
          {visible.map((reference) => (
            <ReferenceItem
              key={reference.id}
              reference={reference}
              citing={citing.get(reference.id) ?? []}
              methodNames={methodNames}
              typeLabel={catalog.labels.referenceType(reference.type, locale)}
              highlighted={reference.id === target}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

import { BookSearch, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { RegistryParticularsDto } from '@/shared/api/generated/fleet/model';
import { useRegistryControllerSearch } from '@/shared/api/generated/fleet/registry/registry';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { MmsiText } from '@/shared/domain-ui/values';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { formatNumber } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';

import { localizeProblem } from '@/shared/api/problem-copy';
import { fleetProblemCopies } from '../lib/problems';
import { FlagText } from './flag-text';

/**
 * Registry lookup (`GET /registry/search?q=`, legacy secondary ship data): search by name, IMO
 * or MMSI and pick an entry to prefill the form.
 */
export function RegistryLookupDialog({
  onPick,
}: {
  onPick: (entry: RegistryParticularsDto) => void;
}) {
  const { t, i18n } = useTranslation('vessels');
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const query = useDebouncedValue(term.trim(), 300);
  const search = useRegistryControllerSearch(
    { q: query, pageSize: 8 },
    { query: { enabled: open && query.length >= 2, staleTime: 60_000 } },
  );
  const results = search.data?.data ?? [];
  const n = (value: number | null) =>
    formatNumber(value, i18n.language, { maximumFractionDigits: 1 });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <BookSearch /> {t('registry.open')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('registry.title')}</DialogTitle>
          <DialogDescription>{t('registry.description')}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t('registry.placeholder')}
            aria-label={t('registry.label')}
            className="pl-8"
            maxLength={100}
          />
        </div>
        <div className="max-h-[50vh] min-h-40 overflow-y-auto" aria-live="polite">
          {query.length < 2 ? (
            <EmptyState
              icon={BookSearch}
              size="sm"
              title={t('registry.start')}
              description={t('registry.startHint')}
            />
          ) : search.isPending ? (
            <div className="grid gap-2">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : search.error ? (
            <ErrorState
              size="sm"
              error={localizeProblem(search.error, fleetProblemCopies(t))}
              onRetry={() => void search.refetch()}
            />
          ) : results.length === 0 ? (
            <EmptyState
              icon={Search}
              size="sm"
              title={t('registry.none')}
              description={t('registry.noneHint')}
            />
          ) : (
            <ul className="grid gap-2">
              {results.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(entry);
                      setOpen(false);
                    }}
                    className="flex w-full cursor-pointer flex-col gap-1.5 rounded-lg border px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{entry.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {entry.typeName ?? entry.type ?? '—'}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        MMSI <MmsiText mmsi={entry.mmsi} />
                      </span>
                      <span>
                        IMO <span className="font-mono">{entry.imo ?? '—'}</span>
                      </span>
                      <FlagText code={entry.flag} showName={false} />
                      <span>
                        GT <span className="font-mono">{n(entry.gt)}</span> · DWT{' '}
                        <span className="font-mono">{n(entry.dwt)}</span>
                      </span>
                      <span>{t('registry.built', { year: entry.built ?? '—' })}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

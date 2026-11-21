import { ArrowUpRight, BookOpen, Info, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { cn } from '@/shared/lib/utils';
import { Formula, useMethodCatalog } from '@/shared/methodology';
import { Badge } from '@/shared/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Skeleton } from '@/shared/ui/skeleton';

/**
 * "ⓘ Sumber" popover next to a computed figure (spec §17): method name, formula (KaTeX),
 * variables and units, constants and source links, with a link to /methodology#<methodId>.
 */
export function MethodInfo({
  methodId,
  className,
  side = 'top',
}: {
  methodId: string;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const [open, setOpen] = useState(false);
  const catalogQuery = useMethodCatalog(open);
  const catalog = catalogQuery.data;
  const method = catalog?.getMethod(methodId);
  const references = method ? (catalog?.referencesOfMethod(methodId) ?? []) : [];
  const name = method?.name[locale] ?? methodId;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('method.trigger', { name })}
          className={cn(
            'inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/12 hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
            className,
          )}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} className="w-[min(28rem,calc(100vw-2rem))] p-0">
        {catalogQuery.isPending ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !method ? (
          <div className="flex gap-3 p-4" role="status">
            <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="space-y-1">
              <p className="text-sm font-semibold">{t('method.pending')}</p>
              <p className="text-xs text-muted-foreground">
                {t('method.pendingDescription', { methodId })}
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea
            className="max-h-[min(32rem,70dvh)]"
            viewportClassName="max-h-[min(32rem,70dvh)]"
          >
            <div className="space-y-4 p-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="primary">{catalog?.labels.domain(method.domain, locale)}</Badge>
                  <Badge variant="muted">{catalog?.labels.status(method.status, locale)}</Badge>
                  {method.needsCitation && (
                    <Badge variant="warning" title={t('method.needsCitationDescription')}>
                      <TriangleAlert /> {t('method.needsCitation')}
                    </Badge>
                  )}
                </div>
                <h3 className="text-sm leading-snug font-semibold">{method.name[locale]}</h3>
                <p className="text-xs text-muted-foreground">{method.summary[locale]}</p>
                <p className="font-mono text-[10px] text-muted-foreground/80">{method.id}</p>
              </div>

              {method.formulaLatex && (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <span className="sr-only">{t('method.formula')}: </span>
                  <Formula latex={method.formulaLatex} />
                </div>
              )}

              {method.variables.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {t('method.variables')}
                  </p>
                  <ul className="space-y-1 text-xs">
                    {method.variables.map((variable) => (
                      <li key={variable.symbol} className="flex items-baseline gap-2">
                        <Formula latex={variable.symbol} displayMode={false} className="shrink-0" />
                        <span className="text-muted-foreground">{variable.name[locale]}</span>
                        {variable.unit && (
                          <span className="ml-auto shrink-0 font-mono text-[11px]">
                            [{variable.unit}]
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {method.constants.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {t('method.constants')}
                  </p>
                  <ul className="space-y-1 text-xs">
                    {method.constants.map((constant) => (
                      <li key={constant.symbol} className="flex items-baseline gap-2">
                        <Formula latex={constant.symbol} displayMode={false} className="shrink-0" />
                        <span className="text-muted-foreground">{constant.name[locale]}</span>
                        <span className="ml-auto shrink-0 font-mono text-[11px]">
                          {String(constant.value)}
                          {constant.unit ? ` ${constant.unit}` : ''}
                        </span>
                        {constant.needsCitation && (
                          <TriangleAlert
                            className="size-3 shrink-0 text-warning"
                            aria-label={t('method.needsCitation')}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {references.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {t('method.references')}
                  </p>
                  <ul className="space-y-2 text-xs">
                    {references.map((reference) => (
                      <li key={reference.id} className="leading-snug">
                        <span className="text-muted-foreground">
                          {reference.issuerOrAuthors}
                          {reference.year ? ` (${reference.year})` : ''}.{' '}
                        </span>
                        {reference.url ? (
                          <a
                            href={reference.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
                          >
                            {reference.title}
                            <ArrowUpRight className="ml-0.5 inline size-3" aria-hidden />
                          </a>
                        ) : (
                          <span className="font-medium">{reference.title}</span>
                        )}
                        <span className="text-muted-foreground">
                          {' · '}
                          {catalog?.labels.referenceType(reference.type, locale)}
                          {reference.identifier ? ` · ${reference.identifier}` : ''}
                          {reference.license ? ` · ${reference.license}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
        <div className="border-t px-4 py-2.5">
          <Link
            to={`/methodology#${encodeURIComponent(methodId)}`}
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <BookOpen className="size-3.5" aria-hidden /> {t('method.openMethodology')}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

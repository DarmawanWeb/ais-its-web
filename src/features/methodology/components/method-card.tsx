import type { Reference } from '@darmawanweb/ais-its-contracts/references';
import { ArrowUpRight, Code2, History, TriangleAlert } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { Formula } from '@/shared/methodology';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { CopyButton } from '@/shared/ui/copy-button';

import { type DisplayMethod, referenceIdsOf } from '../lib/catalog';
import { StatusBadge, VerificationBadge } from './badges';

function NotesText({ text }: { text: string }) {
  const { t } = useTranslation('methodology');
  const [open, setOpen] = useState(false);
  const long = text.length > 320;
  return (
    <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
      <p className="mb-1 text-[11px] font-semibold tracking-wide uppercase">{t('notes')}</p>
      <p
        className={cn('whitespace-pre-line', long && !open && 'line-clamp-3 print:line-clamp-none')}
      >
        {text}
      </p>
      {long && (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="h-auto px-0 print:hidden"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? t('showLess') : t('showMore')}
        </Button>
      )}
    </div>
  );
}

/** One method of the catalog with its anchor `#<methodId>` (target of the MethodInfo links). */
export const MethodCard = memo(function MethodCard({
  method,
  references,
  locale,
  highlighted,
}: {
  method: DisplayMethod;
  /** Reference lookup of the catalog. */
  references: ReadonlyMap<string, Reference>;
  locale: 'id' | 'en';
  highlighted: boolean;
}) {
  const { t } = useTranslation('methodology');
  const titleId = `${method.id}-title`;
  const cited = referenceIdsOf(method);
  const link =
    typeof window === 'undefined'
      ? `#${method.id}`
      : `${window.location.origin}/methodology#${encodeURIComponent(method.id)}`;
  const constantNeedsCitation = method.constants.some((constant) => constant.needsCitation);

  return (
    <article
      id={method.id}
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cn(
        'min-w-0 scroll-mt-24 rounded-xl border bg-surface p-5 shadow-xs transition-shadow outline-none print:break-inside-avoid print:shadow-none',
        highlighted && 'ring-2 ring-primary/70',
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 id={titleId} className="leading-snug font-semibold">
            {method.name[locale]}
          </h3>
          <p className="flex items-center gap-1">
            <code className="font-mono text-xs break-all text-muted-foreground">{method.id}</code>
            <CopyButton
              value={link}
              label={t('copyLink')}
              successMessage={t('linkCopied')}
              icon="link"
              className="text-muted-foreground hover:text-foreground"
            />
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={method.status} />
          {method.origin === 'service' && (
            <Badge variant="info" title={t('uncataloguedHint')}>
              {t('uncatalogued')}
            </Badge>
          )}
          {(method.needsCitation || constantNeedsCitation) && (
            <Badge variant="warning" title={t('common:method.needsCitationDescription')}>
              <TriangleAlert aria-hidden />
              {method.needsCitation ? t('common:method.needsCitation') : t('constantNeedsCitation')}
            </Badge>
          )}
        </div>
      </header>

      {method.summary && (
        <p className="mt-2 text-sm text-pretty text-muted-foreground">{method.summary[locale]}</p>
      )}

      {method.formulaLatex && (
        <div className="mt-3 max-w-full rounded-lg border bg-muted/30 px-4 py-2">
          <span className="sr-only">{t('common:method.formula')}: </span>
          <Formula latex={method.formulaLatex} className="max-w-full" />
        </div>
      )}

      {(method.variables.length > 0 || method.constants.length > 0) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {method.variables.length > 0 && (
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t('variables')}
              </p>
              <dl className="mt-1.5 space-y-1 text-sm">
                {method.variables.map((variable) => (
                  <div key={variable.symbol} className="flex items-baseline gap-2">
                    <dt className="shrink-0">
                      <Formula latex={variable.symbol} displayMode={false} />
                    </dt>
                    <dd className="min-w-0 flex-1 text-muted-foreground">
                      {variable.name[locale]}
                    </dd>
                    {variable.unit && (
                      <dd className="shrink-0 font-mono text-xs">
                        <span className="sr-only">{t('unit')} </span>[{variable.unit}]
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
            </div>
          )}
          {method.constants.length > 0 && (
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t('constants')}
              </p>
              <dl className="mt-1.5 space-y-1.5 text-sm">
                {method.constants.map((constant) => (
                  <div key={constant.symbol} className="flex flex-wrap items-baseline gap-x-2">
                    <dt className="shrink-0">
                      <Formula latex={constant.symbol} displayMode={false} />
                    </dt>
                    <dd className="min-w-0 flex-1 text-muted-foreground">
                      {constant.name[locale]}
                      {constant.referenceIds.length > 0 && (
                        <span className="ml-1 text-xs">
                          {constant.referenceIds.map((id) => (
                            <a
                              key={id}
                              href={`#ref-${id}`}
                              className="mr-1 text-primary hover:underline"
                            >
                              [{cited.indexOf(id) + 1}]
                              <span className="sr-only">
                                {' '}
                                {t('jumpToReference', { title: references.get(id)?.title ?? id })}
                              </span>
                            </a>
                          ))}
                        </span>
                      )}
                    </dd>
                    {/* Values can be long lists (Holtrop coefficients): they wrap, never widen the page. */}
                    <dd className="max-w-full min-w-0 font-mono text-xs [overflow-wrap:anywhere]">
                      {String(constant.value)}
                      {constant.unit ? ` ${constant.unit}` : ''}
                      {constant.needsCitation && (
                        <>
                          <TriangleAlert
                            className="ml-1 inline size-3 align-[-2px] text-warning"
                            aria-hidden
                          />
                          <span className="sr-only">{t('common:method.needsCitation')}</span>
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {(method.implementedBy || method.legacy.length > 0) && (
        <div className="mt-4 grid gap-2 text-xs">
          {method.implementedBy && (
            <p className="flex items-start gap-1.5">
              <Code2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0">
                <span className="font-medium">{t('implementedBy')}: </span>
                <span className="font-semibold">{method.implementedBy.service}</span>
                {method.implementedBy.module && (
                  <code className="ml-1.5 font-mono break-all text-muted-foreground">
                    {method.implementedBy.module}
                  </code>
                )}
              </span>
            </p>
          )}
          {method.legacy.length > 0 && (
            <p className="flex items-start gap-1.5">
              <History className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0">
                <span className="font-medium">{t('legacy')}: </span>
                {method.legacy.map((item, index) => (
                  <code key={item} className="font-mono break-all text-muted-foreground">
                    {index > 0 && ', '}
                    {item}
                  </code>
                ))}
              </span>
            </p>
          )}
        </div>
      )}

      {method.notes && (
        <div className="mt-4">
          <NotesText text={method.notes[locale]} />
        </div>
      )}

      {(cited.length > 0 || method.inlineReferences.length > 0) && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t('references')}
          </p>
          <ol className="mt-1.5 space-y-1.5 text-sm">
            {cited.map((id, index) => {
              const reference = references.get(id);
              return (
                <li key={id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-mono text-xs text-muted-foreground">[{index + 1}]</span>
                  {reference ? (
                    <>
                      <a
                        href={`#ref-${id}`}
                        className="min-w-0 font-medium break-words hover:text-primary hover:underline"
                      >
                        {reference.title}
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {reference.issuerOrAuthors}
                        {reference.year ? ` (${reference.year})` : ''}
                      </span>
                      <VerificationBadge verification={reference.verification} />
                    </>
                  ) : (
                    <code className="font-mono text-xs">{id}</code>
                  )}
                </li>
              );
            })}
            {method.inlineReferences.map((reference) => (
              <li key={reference.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-xs text-muted-foreground">·</span>
                {reference.url ? (
                  <a
                    href={reference.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium break-words hover:text-primary hover:underline"
                  >
                    {reference.title}
                    <ArrowUpRight className="ml-0.5 inline size-3" aria-hidden />
                  </a>
                ) : (
                  <span className="font-medium">{reference.title}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </article>
  );
});

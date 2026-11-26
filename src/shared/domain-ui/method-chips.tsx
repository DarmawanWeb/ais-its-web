import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { useMethodName } from '@/shared/methodology/use-method-name';

import { MethodInfo } from './method-info';

/**
 * The methods behind a figure or a detector (spec §17) as named chips, each with its
 * `MethodInfo` popover (formula, variables, sources). Names come from the methodology catalog
 * (`nameOf` overrides it, e.g. `useMethodName(service.methods)`); with `limit`, the rest is
 * behind a "+N" toggle; `label` is shown before the chips.
 */
export function MethodChips({
  methodIds,
  limit,
  label,
  nameOf,
  className,
}: {
  methodIds: readonly string[];
  limit?: number;
  label?: ReactNode;
  nameOf?: (methodId: string) => string;
  className?: string;
}) {
  const { t } = useTranslation();
  const catalogName = useMethodName();
  const name = nameOf ?? catalogName;
  const [expanded, setExpanded] = useState(false);
  const unique = [...new Set(methodIds)];
  if (unique.length === 0) return null;
  const visible = limit && !expanded ? unique.slice(0, limit) : unique;
  const hidden = unique.length - visible.length;
  const chips = (
    <ul className={cn('flex min-w-0 flex-wrap items-center gap-1.5', !label && className)}>
      {visible.map((methodId) => (
        <li
          key={methodId}
          className="inline-flex min-w-0 items-center gap-0.5 rounded-full border bg-muted/40 py-0.5 pr-0.5 pl-2.5 text-xs text-foreground/90"
        >
          <span className="max-w-72 truncate" title={name(methodId)}>
            {name(methodId)}
          </span>
          <MethodInfo methodId={methodId} />
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="cursor-pointer rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {t('method.more', { count: hidden })}
          </button>
        </li>
      )}
    </ul>
  );
  if (!label) return chips;
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1.5', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {chips}
    </div>
  );
}

import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

export interface KeyValueItem {
  key?: string;
  label: ReactNode;
  value: ReactNode;
  /** Render the value in the monospace font (ids, numbers). */
  mono?: boolean;
  /** Extra content next to the label (e.g. <MethodInfo/>). */
  hint?: ReactNode;
}

/** Definition list of label/value pairs (vessel particulars, event details…). */
export function KeyValueList({
  items,
  columns = 1,
  className,
  dense = false,
}: {
  items: readonly KeyValueItem[];
  columns?: 1 | 2 | 3;
  className?: string;
  dense?: boolean;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6',
        dense ? 'gap-y-2' : 'gap-y-3',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map((item, index) => (
        <div
          key={item.key ?? index}
          className="flex min-w-0 items-baseline justify-between gap-3 border-b border-dashed pb-2 last:border-b-0 sm:block sm:border-0 sm:pb-0"
        >
          <dt className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            {item.label}
            {item.hint}
          </dt>
          <dd
            className={cn(
              'min-w-0 truncate text-right text-sm sm:mt-0.5 sm:text-left',
              item.mono && 'font-mono tabular-nums',
            )}
          >
            {item.value ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

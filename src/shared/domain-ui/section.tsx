import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

export interface SectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Render inside a bordered surface (default) or flat. */
  variant?: 'card' | 'plain';
  id?: string;
}

/** A titled block of a page (renders an <h2>). */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  variant = 'card',
  id,
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'flex flex-col gap-4',
        variant === 'card' && 'rounded-xl border bg-surface p-5 shadow-xs',
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}

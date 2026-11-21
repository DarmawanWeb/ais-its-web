import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Small label above the title (e.g. the navigation section). */
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  /** Buttons on the right (wrap below the title on small screens). */
  actions?: ReactNode;
  /** Extra content under the title row (tabs, filters). */
  children?: ReactNode;
  className?: string;
}

/** Title block of a page; renders the page's single <h1>. */
export function PageHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <div className="mt-0.5 hidden size-10 shrink-0 items-center justify-center rounded-lg border bg-surface text-primary shadow-xs sm:flex">
              <Icon className="size-5" aria-hidden />
            </div>
          )}
          <div className="min-w-0 space-y-1">
            {eyebrow && (
              <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">
                {eyebrow}
              </p>
            )}
            <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
              {title}
            </h1>
            {description && (
              <p className="max-w-3xl text-sm text-pretty text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

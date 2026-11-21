import { CircleDashed, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { UnderConstruction } from './feedback';
import { PageHeader } from './page-header';

/**
 * Scaffold of a page whose feature is not built yet: header, "under construction" panel and
 * the planned scope. Feature engineers replace it with the real page.
 */
export function PlaceholderPage({
  title,
  description,
  eyebrow,
  icon,
  capabilities = [],
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  capabilities?: readonly string[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        eyebrow={eyebrow}
        icon={icon}
        actions={actions}
      />
      {children}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <UnderConstruction module={title} />
        {capabilities.length > 0 && (
          <section className="rounded-xl border bg-surface p-5 shadow-xs">
            <h2 className="text-sm font-semibold">{t('status.plannedScope')}</h2>
            <ul className="mt-3 space-y-2.5">
              {capabilities.map((capability) => (
                <li key={capability} className="flex gap-2.5 text-sm text-muted-foreground">
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-primary/70" aria-hidden />
                  <span>{capability}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

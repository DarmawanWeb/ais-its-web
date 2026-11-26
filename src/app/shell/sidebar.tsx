import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

import { usePermissions } from '@/shared/auth/hooks';
import { appConfig } from '@/shared/config/env';
import { BrandLogo } from '@/shared/domain-ui/brand';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/shared/stores/ui-store';
import { Button } from '@/shared/ui/button';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { SimpleTooltip } from '@/shared/ui/tooltip';

import { features } from '../features';
import { buildNavigation, slotContributions } from '../navigation';

export function useNavigationSections() {
  const permissions = usePermissions();
  return useMemo(() => buildNavigation(features, permissions), [permissions]);
}

/** Navigation list shared by the desktop sidebar and the mobile sheet. */
export function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const sections = useNavigationSections();
  return (
    <nav aria-label={t('nav.mainNavigation')} className="flex flex-col gap-5 px-3 py-4">
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-0.5">
          {collapsed ? (
            <div className="mx-auto mb-1 h-px w-6 bg-sidebar-border" aria-hidden />
          ) : (
            <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-[0.12em] text-sidebar-muted uppercase">
              {t(section.labelKey)}
            </p>
          )}
          {section.items.map((item) => {
            const label = t(item.labelKey);
            const link = (
              <NavLink
                key={item.id}
                to={item.path}
                end={item.end}
                onClick={onNavigate}
                aria-label={collapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    'group relative flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-sidebar-foreground/85 transition-colors outline-none hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    collapsed && 'justify-center px-0',
                    isActive &&
                      'bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:top-1.5 before:bottom-1.5 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-primary',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className={cn(
                        'size-4 shrink-0 text-sidebar-muted transition-colors group-hover:text-sidebar-accent-foreground',
                        isActive && 'text-primary group-hover:text-primary',
                      )}
                      aria-hidden
                    />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </>
                )}
              </NavLink>
            );
            return collapsed ? (
              <SimpleTooltip key={item.id} label={label} side="right">
                {link}
              </SimpleTooltip>
            ) : (
              link
            );
          })}
        </div>
      ))}
    </nav>
  );
}

const sidebarFooter = slotContributions(features, 'sidebar.footer');

/** Desktop sidebar (collapsible to icons). */
export function Sidebar() {
  const { t } = useTranslation();
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggle = useUiStore((state) => state.toggleSidebar);
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[68px]' : 'w-[252px]',
      )}
      data-collapsed={collapsed}
    >
      <div
        className={cn(
          'flex h-14 items-center border-b border-sidebar-border',
          collapsed ? 'justify-center px-2' : 'px-4',
        )}
      >
        <BrandLogo collapsed={collapsed} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <SidebarNav collapsed={collapsed} />
      </ScrollArea>
      {sidebarFooter.map(({ key, component: Footer }) => (
        <Footer key={key} />
      ))}
      <div
        className={cn(
          'flex items-center border-t border-sidebar-border p-2',
          collapsed ? 'justify-center' : 'justify-between pl-4',
        )}
      >
        {!collapsed && (
          <span className="font-mono text-[11px] text-sidebar-muted">
            v{appConfig.appVersion}
            {appConfig.environment !== 'production' && ` · ${appConfig.environment}`}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
          className="text-sidebar-muted hover:text-sidebar-accent-foreground"
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>
    </aside>
  );
}

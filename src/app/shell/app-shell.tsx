import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useNavigation } from 'react-router';

import { useMe, usePermissions } from '@/shared/auth/hooks';
import { satisfies } from '@/shared/auth/permissions';
import { BrandLogo } from '@/shared/domain-ui/brand';
import { ForbiddenState } from '@/shared/domain-ui/feedback';
import { cn } from '@/shared/lib/utils';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/shared/ui/sheet';

import { CommandPalette } from './command-palette';
import { OrgSwitcher } from './org-switcher';
import { useRouteHandle } from './route-handle';
import { Sidebar, SidebarNav } from './sidebar';
import { Topbar } from './topbar';

function RouteProgress() {
  const navigation = useNavigation();
  if (navigation.state === 'idle') return null;
  return (
    <div
      className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
      role="progressbar"
      aria-label="Loading"
    >
      <div className="h-full w-1/3 animate-progress rounded-full bg-primary" />
    </div>
  );
}

function useDocumentTitle(titleKey: string | undefined) {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    const app = t('app.name');
    document.title = titleKey ? `${t(titleKey)} · ${app}` : app;
  }, [titleKey, t, i18n.language]);
}

/** Authenticated layout: sidebar, top bar, content area, command palette. */
export function AppShell() {
  const { t } = useTranslation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const handle = useRouteHandle();
  const permissions = usePermissions();
  const allowed = handle.permissions.every((requirement) => satisfies(permissions, requirement));
  const fullBleed = handle.layout === 'full-bleed';
  useDocumentTitle(handle.titleKey);
  useMe();

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('shell.skipToContent')}
      </a>
      <RouteProgress />
      <Sidebar />
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-72 gap-0 bg-sidebar p-0"
          closeLabel={t('actions.close')}
        >
          <SheetTitle className="flex h-14 items-center border-b border-sidebar-border px-4">
            <BrandLogo />
          </SheetTitle>
          <SheetDescription className="sr-only">{t('nav.mainNavigation')}</SheetDescription>
          <div className="border-b border-sidebar-border p-3 md:hidden">
            <OrgSwitcher className="w-full max-w-none" />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
          </ScrollArea>
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            'outline-none',
            fullBleed
              ? 'relative h-[calc(100dvh-3.5rem)] overflow-hidden'
              : 'flex-1 px-4 py-6 sm:px-6 lg:px-8',
          )}
        >
          <div className={cn(fullBleed ? 'h-full' : 'mx-auto w-full max-w-[1600px]')}>
            {allowed ? <Outlet /> : <ForbiddenState className="py-24" />}
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}

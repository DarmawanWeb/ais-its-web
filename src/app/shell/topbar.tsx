import { ChevronRight, Menu, Search } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { BrandMark } from '@/shared/domain-ui/brand';
import { LanguageToggle, ThemeToggle } from '@/shared/domain-ui/preference-toggles';
import { Button } from '@/shared/ui/button';
import { Kbd } from '@/shared/ui/kbd';

import { features } from '../features';
import { singleSlotComponent, slotContributions } from '../navigation';
import { AlertsBellPlaceholder } from './alerts-bell';
import { useCommandPalette } from './command-palette';
import { OrgSwitcher } from './org-switcher';
import { RealtimeIndicator } from './realtime-indicator';
import { useRouteHandle } from './route-handle';
import { useNavigationSections } from './sidebar';
import { UserMenu } from './user-menu';

function useBreadcrumb(): { section: string | null; title: string | null } {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { titleKey } = useRouteHandle();
  const sections = useNavigationSections();
  return useMemo(() => {
    let best: { section: string; label: string; length: number } | null = null;
    for (const section of sections) {
      for (const item of section.items) {
        const matches = pathname === item.path || pathname.startsWith(`${item.path}/`);
        if (matches && (!best || item.path.length > best.length)) {
          best = {
            section: t(section.labelKey),
            label: t(item.labelKey),
            length: item.path.length,
          };
        }
      }
    }
    return {
      section: best?.section ?? null,
      title: titleKey ? t(titleKey) : (best?.label ?? null),
    };
  }, [pathname, sections, titleKey, t]);
}

/** Components plugged by features into the top bar (resolved once: features are static). */
const AlertsSlot = singleSlotComponent(features, 'topbar.alerts') ?? AlertsBellPlaceholder;
const topbarActions = slotContributions(features, 'topbar.actions');

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { t } = useTranslation();
  const setPaletteOpen = useCommandPalette((state) => state.setOpen);
  const breadcrumb = useBreadcrumb();
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md sm:px-4 lg:px-6">
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={onOpenMobileNav}
        aria-label={t('nav.openMenu')}
      >
        <Menu />
      </Button>
      <BrandMark className="size-7 lg:hidden" />
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
        {breadcrumb.section && (
          <>
            <span className="text-muted-foreground">{breadcrumb.section}</span>
            <ChevronRight className="size-3.5 text-muted-foreground/60" aria-hidden />
          </>
        )}
        {breadcrumb.title && <span className="truncate font-medium">{breadcrumb.title}</span>}
      </nav>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPaletteOpen(true)}
          className="h-8 w-9 justify-start gap-2 bg-surface/60 px-2 text-muted-foreground sm:w-56 lg:w-72"
          aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
          title={t('shell.search')}
          data-testid="command-palette-trigger"
        >
          <Search aria-hidden />
          {/* The accessible name is the visible text (WCAG 2.5.3); screen-reader only on phones. */}
          <span className="sr-only truncate font-normal sm:not-sr-only">
            {t('shell.searchShort')}
          </span>
          <span className="ml-auto hidden items-center gap-0.5 sm:flex">
            <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </Button>
        <RealtimeIndicator />
        {topbarActions.map(({ key, component: Action }) => (
          <Action key={key} />
        ))}
        <AlertsSlot />
        <ThemeToggle />
        <LanguageToggle />
        <OrgSwitcher className="hidden md:inline-flex" />
        <UserMenu />
      </div>
    </header>
  );
}

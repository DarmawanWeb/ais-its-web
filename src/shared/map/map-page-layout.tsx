import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/shared/ui/drawer';

export interface MapPageLayoutProps {
  /** The <MapView> (fills the page). */
  map: ReactNode;
  /** Floating panel at the top left (search, filters, layer toggles). */
  topLeft?: ReactNode;
  /** Floating element centred at the top (status chips). */
  topCenter?: ReactNode;
  /** Floating panel at the bottom left, above the scale (legends). */
  bottomLeft?: ReactNode;
  /** Detail panel: a right column on desktop, a bottom drawer on mobile. */
  sidePanel?: ReactNode;
  sidePanelTitle?: ReactNode;
  sidePanelOpen?: boolean;
  onSidePanelOpenChange?: (open: boolean) => void;
  className?: string;
}

/**
 * Full-bleed map page: the map fills the content area, panels float above it. Use with a
 * route `handle: { layout: 'full-bleed' }` so the shell removes its padding.
 */
export function MapPageLayout({
  map,
  topLeft,
  topCenter,
  bottomLeft,
  sidePanel,
  sidePanelTitle,
  sidePanelOpen = false,
  onSidePanelOpenChange,
  className,
}: MapPageLayoutProps) {
  const { t } = useTranslation();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const showSide = !!sidePanel && sidePanelOpen;

  return (
    <div className={cn('relative flex h-full w-full overflow-hidden', className)}>
      <div className="relative min-w-0 flex-1">
        {map}
        {topLeft && (
          <div className="pointer-events-none absolute top-3 left-3 z-10 flex max-h-[calc(100%-5rem)] w-[min(22rem,calc(100%-4.5rem))] flex-col gap-2 *:pointer-events-auto">
            {topLeft}
          </div>
        )}
        {topCenter && (
          <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 *:pointer-events-auto">
            {topCenter}
          </div>
        )}
        {bottomLeft && (
          <div className="pointer-events-none absolute bottom-9 left-3 z-10 flex flex-col gap-2 *:pointer-events-auto">
            {bottomLeft}
          </div>
        )}
      </div>
      {showSide && desktop && (
        <aside className="relative z-10 flex w-[400px] shrink-0 flex-col border-l bg-surface">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <div className="min-w-0 truncate font-semibold">{sidePanelTitle}</div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onSidePanelOpenChange?.(false)}
              aria-label={t('actions.close')}
            >
              <X />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{sidePanel}</div>
        </aside>
      )}
      {!desktop && sidePanel && (
        <Drawer open={sidePanelOpen} onOpenChange={onSidePanelOpenChange}>
          <DrawerContent>
            <DrawerTitle className="px-4 pt-2">{sidePanelTitle}</DrawerTitle>
            <DrawerDescription className="sr-only">{sidePanelTitle}</DrawerDescription>
            <div className="max-h-[70vh] overflow-y-auto">{sidePanel}</div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}

/** Glass card for floating map panels. */
export function MapPanel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'glass-panel flex min-h-0 flex-col overflow-hidden rounded-xl border shadow-panel',
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="min-w-0 truncate text-sm font-semibold">{title}</div>
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </div>
      )}
      {children && <div className="min-h-0 overflow-y-auto p-3">{children}</div>}
    </div>
  );
}

import { Check, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

import { basemapDefinitions } from './basemaps';
import { useMapContext } from './context';

const PREVIEW: Record<string, string> = {
  vector: 'bg-[linear-gradient(135deg,#0b1626_0%,#16263d_55%,#24405f_100%)]',
  osm: 'bg-[linear-gradient(135deg,#aad3df_0%,#f2efe9_55%,#cde6b4_100%)]',
  satellite: 'bg-[linear-gradient(135deg,#0d2a3f_0%,#1d4a3a_50%,#6b6a4b_100%)]',
};

/** Basemap picker (dark vector when configured, OpenStreetMap, Esri satellite). */
export function BasemapSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { basemap, setBasemap } = useMapContext();
  const options = basemapDefinitions().filter((option) => option.available);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('map.basemap')}
          title={t('map.basemap')}
          className={cn(
            'glass-panel absolute right-2.5 bottom-9 z-10 flex size-9 cursor-pointer items-center justify-center rounded-lg border text-foreground shadow-elevated transition-colors hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
            className,
          )}
        >
          <Layers className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" align="end" className="w-60 p-2">
        <p className="px-1 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t('map.basemap')}
        </p>
        <div className="grid gap-1" role="radiogroup" aria-label={t('map.basemap')}>
          {options.map((option) => {
            const active = option.id === basemap;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setBasemap(option.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md p-1.5 text-left text-sm transition-colors hover:bg-accent',
                  active && 'bg-accent',
                )}
              >
                <span
                  className={cn(
                    'size-9 shrink-0 rounded-md ring-1 ring-border',
                    PREVIEW[option.id],
                  )}
                />
                <span className="flex-1">{t(option.labelKey)}</span>
                {active && <Check className="size-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

import {
  AIS_SOURCES,
  alertTypeLabel,
  NAV_STATUS_CODES,
  NAV_STATUS_LABELS,
} from '@darmawanweb/ais-its-contracts/domain';
import { ChevronDown, Filter, Layers, RotateCcw, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { usePermission } from '@/shared/auth/hooks';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { cn } from '@/shared/lib/utils';
import { VESSEL_ICON_NAMES, type VesselIconName } from '@/shared/map/vessel-icons';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import { SURVEILLANCE_EVENT_TYPES, useLiveMapStore } from '../hooks/use-live-map-store';
import { EVENT_TYPE_STYLE } from '../lib/surveillance';
import type { MapLayerKey } from '../lib/url-state';
import { SAFETY_CLASSES, type SafetyClass } from '../lib/vessel-filters';
import { rgbaToCss } from '@/shared/theme/tokens';

function LayerRow({
  id,
  label,
  description,
  checked,
  onChange,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor={`map-layer-${id}`} className="cursor-pointer text-sm font-medium">
            {label}
          </Label>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <Switch
          id={`map-layer-${id}`}
          checked={checked}
          onCheckedChange={onChange}
          data-testid={`layer-${id}`}
        />
      </div>
      {checked && children}
    </div>
  );
}

/** Multi-select of a filter: `null` = everything; unchecking from "all" keeps the others. */
function toggleIn<T>(
  current: ReadonlySet<T> | null,
  all: readonly T[],
  value: T,
): ReadonlySet<T> | null {
  const next = new Set(current ?? all);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next.size === all.length ? null : next;
}

function CheckList<T extends string | number>({
  idPrefix,
  options,
  selected,
  onToggle,
  label,
  className,
}: {
  idPrefix: string;
  options: readonly { value: T; label: ReactNode }[];
  selected: ReadonlySet<T> | null;
  onToggle: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <fieldset className={cn('space-y-1', className)}>
      <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </legend>
      {options.map((option) => {
        const id = `${idPrefix}-${option.value}`;
        return (
          <div
            key={String(option.value)}
            className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/60"
          >
            <Checkbox
              id={id}
              checked={!selected || selected.has(option.value)}
              onCheckedChange={() => onToggle(option.value)}
            />
            <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm font-normal">
              {option.label}
            </Label>
          </div>
        );
      })}
    </fieldset>
  );
}

/** Layer and filter panel of the live map (collapsible; folded by default on phones). */
export function MapControls() {
  const { t, i18n } = useTranslation('map');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const desktop = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? desktop;
  const canSafety = usePermission('safety:read');
  const canSurveillance = usePermission('surveillance:read');
  const canZones = usePermission('zone:read');
  const state = useLiveMapStore(
    useShallow((s) => ({
      layers: s.layers,
      sources: s.sources,
      categories: s.categories,
      navstatus: s.navstatus,
      safety: s.safety,
      eventTypes: s.eventTypes,
      zonesTruncated: s.zonesTruncated,
    })),
  );
  const actions = useLiveMapStore(
    useShallow((s) => ({
      toggleLayer: s.toggleLayer,
      toggleSource: s.toggleSource,
      setCategories: s.setCategories,
      setNavstatus: s.setNavstatus,
      setSafety: s.setSafety,
      resetFilters: s.resetFilters,
      toggleEventType: s.toggleEventType,
    })),
  );
  const has = (key: MapLayerKey) => state.layers.has(key);
  const filterCount =
    (state.categories ? 1 : 0) +
    (state.navstatus ? 1 : 0) +
    (state.safety ? 1 : 0) +
    (state.sources.size < AIS_SOURCES.length ? 1 : 0);

  return (
    <Collapsible
      open={expanded}
      onOpenChange={setOpen}
      className="glass-panel flex max-h-[min(36rem,calc(100dvh-16rem))] min-h-0 flex-col overflow-hidden rounded-xl border shadow-panel"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-semibold"
          data-testid="map-controls-toggle"
        >
          <span className="inline-flex items-center gap-2">
            <Layers className="size-4 text-primary" aria-hidden />
            {t('controls.title')}
            {filterCount > 0 && (
              <Badge variant="primary" className="ml-0.5">
                {t('controls.activeFilters', { count: filterCount })}
              </Badge>
            )}
          </span>
          <ChevronDown
            className={cn('size-4 transition-transform', !expanded && '-rotate-90')}
            aria-hidden
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="min-h-0 overflow-y-auto border-t">
        <Tabs defaultValue="layers" className="gap-0">
          <TabsList className="mx-3 mt-2 grid w-[calc(100%-1.5rem)] grid-cols-2">
            <TabsTrigger value="layers">
              <Layers aria-hidden /> {t('controls.layers')}
            </TabsTrigger>
            <TabsTrigger value="filters">
              <Filter aria-hidden /> {t('controls.filters')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="layers" className="divide-y px-3 pb-2">
            <LayerRow
              id="vessels"
              label={t('layers.vessels')}
              description={t('layers.vesselsHint')}
              checked={has('vessels')}
              onChange={(on) => actions.toggleLayer('vessels', on)}
            >
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('layers.sources')}>
                {AIS_SOURCES.map((source) => {
                  const active = state.sources.has(source);
                  return (
                    <button
                      key={source}
                      type="button"
                      aria-pressed={active}
                      onClick={() => actions.toggleSource(source)}
                      className={cn(
                        'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                        active
                          ? 'border-primary/40 bg-primary/12 text-primary'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t(`sources.${source}`)}
                    </button>
                  );
                })}
              </div>
            </LayerRow>
            {canZones && (
              <>
                <LayerRow
                  id="zones"
                  label={t('layers.zones')}
                  description={t('layers.zonesHint')}
                  checked={has('zones')}
                  onChange={(on) => actions.toggleLayer('zones', on)}
                />
                <LayerRow
                  id="pipelines"
                  label={t('layers.pipelines')}
                  description={t('layers.pipelinesHint')}
                  checked={has('pipelines')}
                  onChange={(on) => actions.toggleLayer('pipelines', on)}
                />
                {state.zonesTruncated && (has('zones') || has('pipelines')) && (
                  <p
                    className="flex items-start gap-1.5 py-2 text-xs text-warning"
                    role="status"
                    data-testid="zones-truncated"
                  >
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {t('layers.zonesTruncated')}
                  </p>
                )}
              </>
            )}
            {canSafety && (
              <LayerRow
                id="encounters"
                label={t('layers.encounters')}
                description={t('layers.encountersHint')}
                checked={has('encounters')}
                onChange={(on) => actions.toggleLayer('encounters', on)}
              />
            )}
            {canSurveillance && (
              <>
                <LayerRow
                  id="events"
                  label={t('layers.events')}
                  description={t('layers.eventsHint')}
                  checked={has('events')}
                  onChange={(on) => actions.toggleLayer('events', on)}
                >
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label={t('layers.eventTypes')}
                  >
                    {SURVEILLANCE_EVENT_TYPES.map((type) => {
                      const active = state.eventTypes.has(type);
                      const style = EVENT_TYPE_STYLE[type] ?? EVENT_TYPE_STYLE.default;
                      return (
                        <button
                          key={type}
                          type="button"
                          aria-pressed={active}
                          onClick={() => actions.toggleEventType(type)}
                          className={cn(
                            'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                            active
                              ? 'bg-accent text-foreground'
                              : 'text-muted-foreground line-through',
                          )}
                        >
                          <span
                            aria-hidden
                            className="flex size-3.5 items-center justify-center rounded-full text-[8px] font-black text-black"
                            style={{ backgroundColor: style ? rgbaToCss(style.color) : undefined }}
                          >
                            {style?.letter}
                          </span>
                          {alertTypeLabel(type, locale)}
                        </button>
                      );
                    })}
                  </div>
                </LayerRow>
                <LayerRow
                  id="heatmap"
                  label={t('layers.heatmap')}
                  description={t('layers.heatmapHint')}
                  checked={has('heatmap')}
                  onChange={(on) => actions.toggleLayer('heatmap', on)}
                />
              </>
            )}
          </TabsContent>
          <TabsContent value="filters" className="space-y-4 px-3 pt-3 pb-3">
            <CheckList<SafetyClass>
              idPrefix="filter-safety"
              label={t('filters.safety')}
              options={SAFETY_CLASSES.map((value) => ({ value, label: t(`safety.${value}`) }))}
              selected={state.safety}
              onToggle={(value) => actions.setSafety(toggleIn(state.safety, SAFETY_CLASSES, value))}
            />
            <CheckList<VesselIconName>
              idPrefix="filter-type"
              label={t('filters.types')}
              options={VESSEL_ICON_NAMES.map((value) => ({
                value,
                label: t(`categories.${value}`),
              }))}
              selected={state.categories}
              onToggle={(value) =>
                actions.setCategories(toggleIn(state.categories, VESSEL_ICON_NAMES, value))
              }
              className="grid grid-cols-1 gap-x-2 sm:grid-cols-2 [&>legend]:col-span-full"
            />
            <CheckList<number>
              idPrefix="filter-nav"
              label={t('filters.navstatus')}
              options={NAV_STATUS_CODES.map((value) => ({
                value,
                label: (
                  <span className="flex items-baseline gap-1.5">
                    <span className="w-4 shrink-0 font-mono text-xs text-muted-foreground">
                      {value}
                    </span>
                    {NAV_STATUS_LABELS[value][locale]}
                  </span>
                ),
              }))}
              selected={state.navstatus}
              onToggle={(value) =>
                actions.setNavstatus(toggleIn(state.navstatus, NAV_STATUS_CODES, value))
              }
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={actions.resetFilters}
              disabled={filterCount === 0}
            >
              <RotateCcw /> {t('filters.reset')}
            </Button>
          </TabsContent>
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  );
}

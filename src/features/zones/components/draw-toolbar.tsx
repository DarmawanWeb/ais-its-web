import { ZONE_MAX_VERTICES } from '@darmawanweb/ais-its-contracts/domain';
import {
  ChevronDown,
  Eraser,
  FileJson,
  FileUp,
  MapPin,
  MousePointer2,
  Pentagon,
  Plus,
  Spline,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MethodInfo } from '@/shared/domain-ui/method-info';
import { formatNumber } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { SimpleTooltip } from '@/shared/ui/tooltip';

import type { EditorMode } from '../hooks/use-terra-draw';
import type { DrawTool, GeometryIssue } from '../lib/geometry-rules';

const TOOLS: { mode: EditorMode; icon: LucideIcon; tool?: DrawTool }[] = [
  { mode: 'select', icon: MousePointer2 },
  { mode: 'polygon', icon: Pentagon, tool: 'polygon' },
  { mode: 'linestring', icon: Spline, tool: 'linestring' },
  { mode: 'point', icon: MapPin, tool: 'point' },
];

/**
 * Drawing panel of the zone editor: tools allowed for the kind, delete/clear, GeoJSON import and
 * export, a coordinate entry for point zones (keyboard alternative to the map), the geometry
 * summary and the problems that block saving.
 */
export function DrawToolbar({
  mode,
  onModeChange,
  allowedTools,
  readOnly,
  hasSelection,
  geometryType,
  vertexCount,
  issues,
  serverIssue,
  onDeleteSelected,
  onClear,
  onImport,
  onExport,
  onAddPoint,
}: {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  allowedTools: readonly DrawTool[];
  readOnly: boolean;
  hasSelection: boolean;
  geometryType: string | null;
  vertexCount: number;
  issues: readonly GeometryIssue[];
  serverIssue: string | null;
  onDeleteSelected: () => void;
  onClear: () => void;
  onImport: () => void;
  onExport: () => void;
  onAddPoint: (lon: number, lat: number) => void;
}) {
  const { t, i18n } = useTranslation('zones');
  const id = useId();
  const [open, setOpen] = useState(true);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const latValue = Number(lat.replace(',', '.'));
  const lonValue = Number(lon.replace(',', '.'));
  const coordinatesValid =
    lat.trim() !== '' &&
    lon.trim() !== '' &&
    latValue >= -90 &&
    latValue <= 90 &&
    lonValue >= -180 &&
    lonValue <= 180;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="glass-panel flex max-h-full min-h-0 flex-col overflow-hidden rounded-xl border shadow-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{t('editor.geometry')}</h2>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={open ? t('editor.collapse') : t('editor.expand')}
          >
            <ChevronDown className={cn('transition-transform', !open && '-rotate-90')} />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="min-h-0 overflow-y-auto">
        <div className="space-y-3 p-3">
          {!readOnly && (
            <>
              <div className="grid grid-cols-4 gap-1" role="toolbar" aria-label={t('editor.tools')}>
                {TOOLS.map((tool) => {
                  const disabled = tool.tool !== undefined && !allowedTools.includes(tool.tool);
                  const label = t(`editor.modes.${tool.mode}`);
                  return (
                    <SimpleTooltip
                      key={tool.mode}
                      label={
                        disabled
                          ? t('editor.toolNotAllowed', { tool: label })
                          : t(`editor.modeHints.${tool.mode}`)
                      }
                    >
                      <Button
                        type="button"
                        variant={mode === tool.mode ? 'default' : 'outline'}
                        size="sm"
                        aria-pressed={mode === tool.mode}
                        disabled={disabled}
                        onClick={() => onModeChange(tool.mode)}
                        className="flex h-auto flex-col gap-1 py-2 text-[11px]"
                      >
                        <tool.icon className="size-4" aria-hidden />
                        {label}
                      </Button>
                    </SimpleTooltip>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(`editor.modeHints.${mode === 'static' ? 'select' : mode}`)}
              </p>
            </>
          )}
          <div className="flex flex-wrap gap-1.5">
            {!readOnly && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={onDeleteSelected}
                  disabled={!hasSelection}
                >
                  <Trash2 /> {t('editor.deleteSelected')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={onClear}
                  disabled={vertexCount === 0}
                >
                  <Eraser /> {t('editor.clear')}
                </Button>
                <Button type="button" variant="outline" size="xs" onClick={onImport}>
                  <FileUp /> {t('actions.import')}
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onExport}
              disabled={vertexCount === 0}
            >
              <FileJson /> {t('actions.exportGeojson')}
            </Button>
          </div>

          {!readOnly && allowedTools.includes('point') && (
            <form
              className="space-y-1.5 rounded-lg border bg-surface/60 p-2"
              aria-labelledby={`${id}-coords`}
              onSubmit={(event) => {
                event.preventDefault();
                if (!coordinatesValid) return;
                onAddPoint(lonValue, latValue);
                setLat('');
                setLon('');
              }}
            >
              <p id={`${id}-coords`} className="text-xs font-medium">
                {t('editor.addPoint')}
              </p>
              <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-1.5">
                <div className="space-y-1">
                  <Label htmlFor={`${id}-lat`} className="text-[11px] text-muted-foreground">
                    {t('common:domain.latitude')}
                  </Label>
                  <Input
                    id={`${id}-lat`}
                    inputMode="decimal"
                    value={lat}
                    onChange={(event) => setLat(event.target.value)}
                    placeholder="1.1652"
                    className="h-7 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${id}-lon`} className="text-[11px] text-muted-foreground">
                    {t('common:domain.longitude')}
                  </Label>
                  <Input
                    id={`${id}-lon`}
                    inputMode="decimal"
                    value={lon}
                    onChange={(event) => setLon(event.target.value)}
                    placeholder="104.0154"
                    className="h-7 font-mono text-xs"
                  />
                </div>
                <Button
                  type="submit"
                  size="icon-xs"
                  disabled={!coordinatesValid}
                  aria-label={t('editor.addPointButton')}
                >
                  <Plus />
                </Button>
              </div>
            </form>
          )}

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-2.5 py-2 text-xs">
            <dt className="text-muted-foreground">{t('editor.type')}</dt>
            <dd className="font-mono">{geometryType ?? '—'}</dd>
            <dt className="flex items-center gap-1 text-muted-foreground">
              {t('editor.vertices')} <MethodInfo methodId="geo.zone_geometry_rules" />
            </dt>
            <dd
              className={cn(
                'font-mono tabular-nums',
                vertexCount > ZONE_MAX_VERTICES && 'text-danger',
              )}
            >
              {formatNumber(vertexCount, i18n.language)} /{' '}
              {formatNumber(ZONE_MAX_VERTICES, i18n.language)}
            </dd>
          </dl>

          {(issues.length > 0 || serverIssue) && (
            <ul className="space-y-1.5" aria-live="polite" data-testid="geometry-issues">
              {issues.map((issue) => (
                <li
                  key={issue.code}
                  className="flex gap-2 rounded-md border border-warning/40 bg-warning/8 px-2 py-1.5 text-xs"
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                  <span>{t(`issues.${issue.code}`, issue.params ?? {})}</span>
                </li>
              ))}
              {serverIssue && (
                <li
                  className="flex gap-2 rounded-md border border-danger/40 bg-danger/8 px-2 py-1.5 text-xs"
                  role="alert"
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
                  <span>{serverIssue}</span>
                </li>
              )}
            </ul>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

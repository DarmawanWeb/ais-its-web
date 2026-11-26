import type { PickingInfo } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { ZoneFeatureCollectionDto } from '@/shared/api/generated/geo/model';
import type { SafetyVesselStateDto } from '@/shared/api/generated/safety/model';
import { cn } from '@/shared/lib/utils';
import { MapView, useDeckLayers, useMapContext, type MapTooltip } from '@/shared/map';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { rgbaToCss, SAFETY_COLORS } from '@/shared/theme/tokens';

import { ewsColor, PIPELINE_COLOR, SAFE_COLOR, withAlpha } from '../lib/colors';
import { pipelinePaths, pipelinesBounds, type PipelinePath } from '../lib/ews';
import type { EwsThresholds } from '../lib/thresholds';
import { MAP_FONT } from '@/shared/map/constants';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function PipelineLayers({
  paths,
  thresholds,
}: {
  paths: PipelinePath[];
  thresholds: EwsThresholds;
}) {
  const layers = useMemo(
    () => [
      // Corridors drawn as wide paths in metres: the warning band (±warningM) and the danger
      // band (±dangerM) around the line — the legacy buffer drawing (ews.fe_buffer_polygons).
      new PathLayer<PipelinePath>({
        id: 'ews-corridor-warning',
        data: paths,
        getPath: (d) => d.path,
        widthUnits: 'meters',
        getWidth: thresholds.warningM * 2,
        capRounded: true,
        jointRounded: true,
        getColor: withAlpha(SAFETY_COLORS.ewsWarning, 34),
      }),
      new PathLayer<PipelinePath>({
        id: 'ews-corridor-danger',
        data: paths,
        getPath: (d) => d.path,
        widthUnits: 'meters',
        getWidth: thresholds.dangerM * 2,
        capRounded: true,
        jointRounded: true,
        getColor: withAlpha(SAFETY_COLORS.ewsDanger, 52),
      }),
      new PathLayer<PipelinePath>({
        id: 'ews-pipeline-casing',
        data: paths,
        getPath: (d) => d.path,
        widthUnits: 'pixels',
        getWidth: 6,
        capRounded: true,
        jointRounded: true,
        getColor: [7, 13, 23, 150],
      }),
      new PathLayer<PipelinePath>({
        id: 'ews-pipeline',
        data: paths,
        getPath: (d) => d.path,
        widthUnits: 'pixels',
        getWidth: 3,
        capRounded: true,
        jointRounded: true,
        getColor: PIPELINE_COLOR,
        pickable: true,
      }),
    ],
    [paths, thresholds.dangerM, thresholds.warningM],
  );
  const getTooltip = useCallback((info: PickingInfo): MapTooltip => {
    const path = info.object as PipelinePath | undefined;
    return path ? { text: path.name, className: 'deck-tooltip' } : null;
  }, []);
  useDeckLayers('ews-pipelines', layers, { order: 20, getTooltip });
  return null;
}

function VesselLayers({
  states,
  selectedMmsi,
  onSelect,
  labels,
}: {
  states: readonly SafetyVesselStateDto[];
  selectedMmsi: number | null;
  onSelect: (mmsi: number) => void;
  labels: { distance: (state: SafetyVesselStateDto) => string; status: (status: number) => string };
}) {
  const layers = useMemo(() => {
    const selected = states.filter((state) => state.mmsi === selectedMmsi);
    const flagged = states.filter((state) => state.ewsStatus !== 3);
    return [
      new ScatterplotLayer<SafetyVesselStateDto>({
        id: 'ews-vessels-ring',
        data: flagged,
        getPosition: (d) => [d.lon, d.lat],
        radiusUnits: 'pixels',
        getRadius: 13,
        filled: true,
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: (d) => (d.ewsStatus === 0 ? 3 : 2),
        getLineColor: (d) => ewsColor(d.ewsStatus),
        getFillColor: (d) => withAlpha(ewsColor(d.ewsStatus), 40),
      }),
      new ScatterplotLayer<SafetyVesselStateDto>({
        id: 'ews-vessels',
        data: states as SafetyVesselStateDto[],
        getPosition: (d) => [d.lon, d.lat],
        radiusUnits: 'pixels',
        getRadius: (d) => (d.ewsStatus === 3 ? 4 : 6),
        filled: true,
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 1.5,
        getLineColor: [7, 13, 23, 230],
        getFillColor: (d) => ewsColor(d.ewsStatus),
        pickable: true,
        onClick: (info: PickingInfo<SafetyVesselStateDto>) => {
          const state = info.object;
          if (state) onSelect(state.mmsi);
          return !!state;
        },
      }),
      new ScatterplotLayer<SafetyVesselStateDto>({
        id: 'ews-vessels-selected',
        data: selected,
        getPosition: (d) => [d.lon, d.lat],
        radiusUnits: 'pixels',
        getRadius: 19,
        filled: false,
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 3,
        getLineColor: SAFETY_COLORS.selected,
      }),
      new TextLayer<SafetyVesselStateDto>({
        id: 'ews-vessels-label',
        data: flagged,
        getPosition: (d) => [d.lon, d.lat],
        getText: (d) => labels.distance(d),
        getSize: 11,
        getPixelOffset: [0, -24],
        getColor: [241, 245, 249, 255],
        outlineWidth: 3,
        outlineColor: [7, 13, 23, 230],
        fontSettings: { sdf: true },
        fontWeight: 600,
        characterSet: 'auto',
        fontFamily: MAP_FONT,
      }),
    ];
  }, [states, selectedMmsi, onSelect, labels]);
  const getTooltip = useCallback(
    (info: PickingInfo): MapTooltip => {
      const state = info.object as SafetyVesselStateDto | undefined;
      if (!state || !('ewsStatus' in state)) return null;
      const name = state.vessel?.name ?? `MMSI ${state.mmsi}`;
      return {
        html: `<strong>${escapeHtml(name)}</strong><br/>${escapeHtml(labels.status(state.ewsStatus))} · ${escapeHtml(labels.distance(state))}`,
        className: 'deck-tooltip',
      };
    },
    [labels],
  );
  useDeckLayers('ews-vessels', layers, { order: 100, getTooltip });
  return null;
}

/** Fits the view to the pipelines once, then flies to the selected vessel. */
function ViewController({
  collection,
  selected,
}: {
  collection: ZoneFeatureCollectionDto | undefined;
  selected: SafetyVesselStateDto | null;
}) {
  const { map } = useMapContext();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    const bounds = pipelinesBounds(collection);
    if (!bounds) return;
    fitted.current = true;
    map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 0 });
  }, [collection, map]);
  const selectedMmsi = selected?.mmsi ?? null;
  const lat = selected?.lat;
  const lon = selected?.lon;
  useEffect(() => {
    if (selectedMmsi === null || lat === undefined || lon === undefined) return;
    map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 12.5), speed: 1.4 });
  }, [selectedMmsi, lat, lon, map]);
  return null;
}

/** EWS map: pipelines with their danger/warning corridors and vessels coloured by EWS status. */
export function EwsMap({
  pipelines,
  states,
  thresholds,
  selectedMmsi,
  onSelect,
  className,
}: {
  pipelines: ZoneFeatureCollectionDto | undefined;
  states: readonly SafetyVesselStateDto[];
  thresholds: EwsThresholds;
  selectedMmsi: number | null;
  onSelect: (mmsi: number) => void;
  className?: string;
}) {
  const { t, i18n } = useTranslation('safety');
  const paths = useMemo(() => pipelinePaths(pipelines), [pipelines]);
  const selected = states.find((state) => state.mmsi === selectedMmsi) ?? null;
  const labels = useMemo(() => {
    const format = new Intl.NumberFormat(i18n.language === 'en' ? 'en-GB' : 'id-ID', {
      maximumFractionDigits: 0,
    });
    return {
      distance: (state: SafetyVesselStateDto) =>
        state.pipelineDistanceM === null ? '—' : `${format.format(state.pipelineDistanceM)} m`,
      status: (status: number) =>
        status === 0
          ? t('ews.status.danger')
          : status === 1
            ? t('ews.status.warning')
            : t('ews.status.safe'),
    };
  }, [i18n.language, t]);

  const legend = [
    {
      key: 'pipeline',
      label: t('ews.map.pipeline'),
      swatch: (
        <span
          className="h-1 w-5 rounded-full"
          style={{ backgroundColor: rgbaToCss(PIPELINE_COLOR) }}
        />
      ),
    },
    {
      key: 'danger-corridor',
      label: t('ews.map.dangerCorridor', { meters: thresholds.dangerM }),
      swatch: (
        <span
          className="h-2.5 w-5 rounded-sm"
          style={{ backgroundColor: rgbaToCss(withAlpha(SAFETY_COLORS.ewsDanger, 110)) }}
        />
      ),
    },
    {
      key: 'warning-corridor',
      label: t('ews.map.warningCorridor', { meters: thresholds.warningM }),
      swatch: (
        <span
          className="h-2.5 w-5 rounded-sm"
          style={{ backgroundColor: rgbaToCss(withAlpha(SAFETY_COLORS.ewsWarning, 90)) }}
        />
      ),
    },
    ...([0, 1, 3] as const).map((status) => ({
      key: `status-${status}`,
      label: labels.status(status),
      swatch: (
        <span
          className={status === 3 ? 'size-2.5 rounded-full' : 'size-3.5 rounded-full border-2'}
          style={
            status === 3
              ? { backgroundColor: rgbaToCss(SAFE_COLOR) }
              : { borderColor: rgbaToCss(ewsColor(status)) }
          }
        />
      ),
    })),
  ];

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative min-h-0 flex-1">
        <MapView ariaLabel={t('ews.map.label')} showBasemapSwitcher>
          <PipelineLayers paths={paths} thresholds={thresholds} />
          <VesselLayers
            states={states}
            selectedMmsi={selectedMmsi}
            onSelect={onSelect}
            labels={labels}
          />
          <ViewController collection={pipelines} selected={selected} />
        </MapView>
      </div>
      <ul
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t bg-surface px-3 py-2 text-xs text-muted-foreground"
        aria-label={t('ews.map.legend')}
      >
        {legend.map((item) => (
          <li key={item.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="flex w-5 items-center justify-center">
              {item.swatch}
            </span>
            {item.label}
          </li>
        ))}
        <li className="ml-auto inline-flex items-center gap-1">
          {t('ews.map.bufferMethod')}
          <MethodInfo methodId="ews.fe_buffer_polygons" />
        </li>
      </ul>
    </div>
  );
}

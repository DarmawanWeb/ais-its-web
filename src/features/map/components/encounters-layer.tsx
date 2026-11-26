import type { PickingInfo } from '@deck.gl/core';
import { PathStyleExtension } from '@deck.gl/extensions';
import { LineLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useEncountersControllerList } from '@/shared/api/generated/safety/encounters/encounters';
import { usePermission } from '@/shared/auth/hooks';
import { useDeckLayers, type MapTooltip } from '@/shared/map';
import type { Rgba } from '@/shared/theme/tokens';

import { useLiveMapStore } from '../hooks/use-live-map-store';
import { useNow } from '@/shared/hooks/use-now';
import { encounterOverlays, riskRgba, type EncounterOverlay } from '../lib/encounters';
import { MAP_FONT } from '@/shared/map/constants';

/** Encounters with a sample in the last minutes count as active on the live map. */
const ACTIVE_WINDOW_MS = 10 * 60_000;

/**
 * Active collision encounters (safety API, spec §13.7) inside <MapView>: the pair line between
 * the vessels, their predicted courses to the closest point of approach (dashed) and the CPA
 * point with its CPA/TCPA label. Refreshed every 30 s.
 */
export function EncountersLayer() {
  const { t, i18n } = useTranslation('map');
  const canRead = usePermission('safety:read');
  const visible = useLiveMapStore((state) => state.layers.has('encounters'));
  const now = useNow(60_000);
  const query = useEncountersControllerList(
    { risk: 'medium,high', from: new Date(now - ACTIVE_WINDOW_MS).toISOString(), limit: 200 },
    { query: { enabled: canRead && visible, refetchInterval: 30_000, staleTime: 15_000 } },
  );
  const overlays = useMemo(
    () =>
      encounterOverlays(
        (query.data?.data ?? []).filter(
          (e) => now - Date.parse(e.lastSampleAt) <= ACTIVE_WINDOW_MS,
        ),
      ),
    [query.data, now],
  );
  const format = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language === 'en' ? 'en-GB' : 'id-ID', {
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );
  const label = useCallback(
    (o: EncounterOverlay) =>
      `CPA ${format.format(o.cpaNm)} nm${o.tcpaMin === null ? '' : ` · ${format.format(o.tcpaMin)} ${t('common:domain.units.minutes')}`}`,
    [format, t],
  );

  const layers = useMemo(() => {
    if (!visible || overlays.length === 0) return null;
    const courses = overlays.flatMap((o) => [
      { path: [o.a, o.cpaA], risk: o.risk },
      { path: [o.b, o.cpaB], risk: o.risk },
    ]);
    return [
      new PathLayer<
        (typeof courses)[number],
        { getDashArray: [number, number]; dashJustified: boolean }
      >({
        id: 'encounter-courses',
        data: courses,
        getPath: (d) => d.path,
        getColor: (d) => riskRgba(d.risk),
        widthUnits: 'pixels',
        getWidth: 2,
        getDashArray: [4, 3],
        dashJustified: true,
        extensions: [new PathStyleExtension({ dash: true })],
      }),
      new LineLayer<EncounterOverlay>({
        id: 'encounter-pairs',
        data: overlays,
        getSourcePosition: (d) => d.a,
        getTargetPosition: (d) => d.b,
        getColor: (d) => [...riskRgba(d.risk).slice(0, 3), 150] as Rgba,
        widthUnits: 'pixels',
        getWidth: 1.5,
      }),
      new ScatterplotLayer<EncounterOverlay>({
        id: 'encounter-cpa',
        data: overlays,
        getPosition: (d) => d.cpaPoint,
        radiusUnits: 'pixels',
        getRadius: 8,
        filled: true,
        getFillColor: (d) => [...riskRgba(d.risk).slice(0, 3), 60] as Rgba,
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 2.5,
        getLineColor: (d) => riskRgba(d.risk),
        pickable: true,
      }),
      new TextLayer<EncounterOverlay>({
        id: 'encounter-cpa-label',
        data: overlays,
        getPosition: (d) => d.cpaPoint,
        getText: label,
        getSize: 11,
        getPixelOffset: [0, -18],
        getColor: [241, 245, 249, 255],
        outlineWidth: 3,
        outlineColor: [7, 13, 23, 230],
        fontSettings: { sdf: true },
        fontWeight: 600,
        characterSet: 'auto',
        fontFamily: MAP_FONT,
      }),
    ];
  }, [visible, overlays, label]);

  const getTooltip = useCallback(
    (info: PickingInfo): MapTooltip => {
      const overlay = info.object as EncounterOverlay | undefined;
      if (!overlay?.cpaPoint) return null;
      return {
        text: `${t('encounters.tooltip', { a: overlay.mmsiA, b: overlay.mmsiB })}\n${label(overlay)}`,
        className: 'deck-tooltip',
      };
    },
    [t, label],
  );
  useDeckLayers('live-encounters', layers, { order: 50, getTooltip });
  return null;
}

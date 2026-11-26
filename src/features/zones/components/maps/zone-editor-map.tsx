import { useEffect, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { MapView } from '@/shared/map';

import { useZonesGeojson } from '../../api/zones-api';
import { type EditorMode, useTerraDraw } from '../../hooks/use-terra-draw';
import type { SimpleGeometry } from '../../lib/draw-geometry';
import { BufferPreviewLayer, FitToBBox, ZonesLayer } from './zone-layers';

export interface DrawControls {
  deleteSelected: () => boolean;
}

function DrawController({
  parts,
  revision,
  mode,
  onPartsChange,
  onSelectionChange,
  controlsRef,
}: {
  parts: readonly SimpleGeometry[];
  revision: number;
  mode: EditorMode;
  onPartsChange: (parts: SimpleGeometry[]) => void;
  onSelectionChange: (selected: boolean) => void;
  controlsRef: RefObject<DrawControls | null>;
}) {
  const controls = useTerraDraw({ parts, revision, mode, onPartsChange, onSelectionChange });
  useEffect(() => {
    controlsRef.current = controls;
  }, [controls, controlsRef]);
  return null;
}

/** Other zones (dim, for orientation) without the edited one. */
function ReferenceZones({ excludeId }: { excludeId: string | null }) {
  const reference = useZonesGeojson({ zoom: 9 });
  const collection = reference.data
    ? {
        ...reference.data,
        features: reference.data.features.filter((feature) => feature.id !== excludeId),
      }
    : undefined;
  return <ZonesLayer id="zones-reference" collection={collection} dim />;
}

/**
 * Map of the zone editor: terra-draw for the geometry (polygon, line, point, select/edit), the
 * zone's buffer preview and the other zones for orientation.
 */
export function ZoneEditorMap({
  parts,
  revision,
  mode,
  bufferM,
  excludeId,
  fitBBox,
  fitKey,
  onPartsChange,
  onSelectionChange,
  controlsRef,
}: {
  parts: readonly SimpleGeometry[];
  revision: number;
  mode: EditorMode;
  bufferM: number;
  excludeId: string | null;
  fitBBox: readonly number[] | null;
  fitKey: string;
  onPartsChange: (parts: SimpleGeometry[]) => void;
  onSelectionChange: (selected: boolean) => void;
  controlsRef: RefObject<DrawControls | null>;
}) {
  const { t } = useTranslation('zones');
  return (
    <MapView ariaLabel={t('editor.mapLabel')}>
      <ReferenceZones excludeId={excludeId} />
      <BufferPreviewLayer parts={parts} bufferM={bufferM} />
      <DrawController
        parts={parts}
        revision={revision}
        mode={mode}
        onPartsChange={onPartsChange}
        onSelectionChange={onSelectionChange}
        controlsRef={controlsRef}
      />
      <FitToBBox bbox={fitBBox} fitKey={fitKey} maxZoom={13} />
    </MapView>
  );
}

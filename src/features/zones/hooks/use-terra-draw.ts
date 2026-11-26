import { useEffect, useRef, useState } from 'react';
import {
  type GeoJSONStoreFeatures,
  type HexColor,
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  ValidateNotSelfIntersecting,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';

import { useMapContext } from '@/shared/map';

import type { SimpleGeometry } from '../lib/draw-geometry';
import type { DrawTool } from '../lib/geometry-rules';

export type EditorMode = 'select' | DrawTool | 'static';

const DRAW: HexColor = '#22d3ee';
const SELECTED: HexColor = '#f59e0b';
const WHITE: HexColor = '#ffffff';

function createModes() {
  return [
    new TerraDrawPolygonMode({
      // Invalid rings are refused while drawing (the service would answer ZONE_GEOMETRY_INVALID).
      validation: (feature, context) =>
        String(context.updateType) === 'provisional'
          ? { valid: true }
          : ValidateNotSelfIntersecting(feature),
      styles: {
        fillColor: DRAW,
        fillOpacity: 0.18,
        outlineColor: DRAW,
        outlineWidth: 2,
        closingPointColor: WHITE,
        closingPointOutlineColor: DRAW,
        closingPointWidth: 5,
        closingPointOutlineWidth: 2,
      },
    }),
    new TerraDrawLineStringMode({
      styles: {
        lineStringColor: DRAW,
        lineStringWidth: 3,
        closingPointColor: WHITE,
        closingPointOutlineColor: DRAW,
        closingPointWidth: 5,
        closingPointOutlineWidth: 2,
      },
    }),
    new TerraDrawPointMode({
      styles: { pointColor: DRAW, pointWidth: 7, pointOutlineColor: WHITE, pointOutlineWidth: 2 },
    }),
    new TerraDrawSelectMode({
      flags: {
        polygon: {
          feature: {
            draggable: true,
            validation: (feature) => ValidateNotSelfIntersecting(feature),
            coordinates: { midpoints: true, draggable: true, deletable: true },
          },
        },
        linestring: {
          feature: {
            draggable: true,
            coordinates: { midpoints: true, draggable: true, deletable: true },
          },
        },
        point: { feature: { draggable: true } },
      },
      styles: {
        selectedPolygonColor: SELECTED,
        selectedPolygonFillOpacity: 0.22,
        selectedPolygonOutlineColor: SELECTED,
        selectedPolygonOutlineWidth: 2,
        selectedLineStringColor: SELECTED,
        selectedLineStringWidth: 3,
        selectedPointColor: SELECTED,
        selectedPointWidth: 8,
        selectedPointOutlineColor: WHITE,
        selectedPointOutlineWidth: 2,
        selectionPointColor: WHITE,
        selectionPointOutlineColor: SELECTED,
        selectionPointWidth: 4,
        selectionPointOutlineWidth: 2,
        midPointColor: SELECTED,
        midPointOutlineColor: WHITE,
        midPointWidth: 3,
      },
    }),
  ];
}

const MODE_OF_TYPE: Record<SimpleGeometry['type'], DrawTool> = {
  Polygon: 'polygon',
  LineString: 'linestring',
  Point: 'point',
};

/** The finished features of the draw store as simple geometries. */
function partsOf(draw: TerraDraw): SimpleGeometry[] {
  return draw
    .getSnapshot()
    .filter((feature) => {
      const mode = feature.properties?.mode;
      return (
        (mode === 'polygon' || mode === 'linestring' || mode === 'point') &&
        !feature.properties?.currentlyDrawing
      );
    })
    .map(
      (feature) =>
        ({
          type: feature.geometry.type,
          coordinates: feature.geometry.coordinates,
        }) as SimpleGeometry,
    )
    .filter(
      (part) => part.type === 'Polygon' || part.type === 'LineString' || part.type === 'Point',
    );
}

function addParts(draw: TerraDraw, parts: readonly SimpleGeometry[]) {
  if (parts.length === 0) return;
  const features: GeoJSONStoreFeatures[] = parts.map((part) => ({
    id: draw.getFeatureId(),
    type: 'Feature' as const,
    geometry: part,
    properties: { mode: MODE_OF_TYPE[part.type] },
  }));
  const results = draw.addFeatures(features);
  const rejected = results.filter((result) => !result.valid);
  if (rejected.length > 0) console.warn('[zones] terra-draw refused features', rejected);
}

/**
 * terra-draw on the surrounding MapView (`TerraDrawMapLibreGLAdapter`), controlled by the editor:
 * `parts` are re-loaded into the draw store whenever `revision` changes (load, import, clear,
 * coordinates entered), user edits report the finished parts through `onPartsChange`, and the
 * mode follows `mode`. A basemap or theme switch replaces the map style, which drops the
 * adapter's layers: the store is then rebuilt from the latest parts.
 */
export function useTerraDraw({
  parts,
  revision,
  mode,
  onPartsChange,
  onSelectionChange,
}: {
  parts: readonly SimpleGeometry[];
  revision: number;
  mode: EditorMode;
  onPartsChange: (parts: SimpleGeometry[]) => void;
  onSelectionChange?: (selected: boolean) => void;
}) {
  const { map } = useMapContext();
  const drawRef = useRef<TerraDraw | null>(null);
  const partsRef = useRef(parts);
  const modeRef = useRef(mode);
  const revisionRef = useRef(revision);
  const [generation, setGeneration] = useState(0);
  /** Revision of `parts` loaded into the draw store (the instance loads the current one). */
  const loadedRevision = useRef(revision);
  /** Programmatic store changes (clear + add) are not user edits: they are not reported. */
  const replacing = useRef(false);
  const callbacks = useRef({ onPartsChange, onSelectionChange });
  useEffect(() => {
    callbacks.current = { onPartsChange, onSelectionChange };
  }, [onPartsChange, onSelectionChange]);

  useEffect(() => {
    partsRef.current = parts;
  }, [parts]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Create the draw instance (again after every style reload).
  useEffect(() => {
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: createModes(),
    });
    // Events of a disposed instance (stop() clears its store) must not reach the editor.
    let disposed = false;
    draw.start();
    replacing.current = true;
    addParts(draw, partsRef.current);
    replacing.current = false;
    loadedRevision.current = revisionRef.current;
    draw.setMode(modeRef.current);
    const report = () => {
      if (!disposed && !replacing.current) callbacks.current.onPartsChange(partsOf(draw));
    };
    draw.on('finish', report);
    draw.on('change', (_ids, type) => {
      if (type === 'delete') report();
    });
    draw.on('select', () => {
      if (!disposed) callbacks.current.onSelectionChange?.(true);
    });
    draw.on('deselect', () => {
      if (!disposed) callbacks.current.onSelectionChange?.(false);
    });
    drawRef.current = draw;
    const onStyle = () => setGeneration((value) => value + 1);
    map.once('style.load', onStyle);
    return () => {
      disposed = true;
      map.off('style.load', onStyle);
      drawRef.current = null;
      try {
        draw.stop();
      } catch {
        // the style was replaced: the adapter's layers are already gone
      }
    };
  }, [map, generation]);

  // External replacement of the parts (import, clear, coordinate entry).
  useEffect(() => {
    revisionRef.current = revision;
    const draw = drawRef.current;
    if (!draw || loadedRevision.current === revision) return;
    loadedRevision.current = revision;
    replacing.current = true;
    try {
      draw.clear();
      addParts(draw, partsRef.current);
    } finally {
      replacing.current = false;
    }
  }, [revision]);

  useEffect(() => {
    drawRef.current?.setMode(mode);
  }, [mode]);

  /** Deletes the selected feature (select mode); `false` when nothing is selected. */
  return {
    deleteSelected(): boolean {
      const draw = drawRef.current;
      if (!draw) return false;
      const selected = draw.getSnapshot().filter((feature) => feature.properties?.selected);
      if (selected.length === 0) return false;
      draw.removeFeatures(selected.map((feature) => feature.id as string));
      callbacks.current.onPartsChange(partsOf(draw));
      return true;
    },
  };
}

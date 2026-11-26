import { useMemo } from 'react';

import type { SurveillanceDetectorDto } from '@/shared/api/generated/surveillance/model';

import { useDetectors } from '../api/queries';

/** Thresholds of one detector (`GET /surveillance/detectors` → `config`), with documented defaults. */
export interface DetectorThresholds {
  detector: SurveillanceDetectorDto | undefined;
  /** `true` while the catalogue loads or when the detector is enabled. */
  enabled: boolean;
  number: (key: string, fallback: number) => number;
  list: (key: string, fallback: readonly string[]) => readonly string[];
}

function readNumber(
  config: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number,
) {
  const value = config?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
    return Number(value);
  return fallback;
}

function readList(
  config: Record<string, unknown> | null | undefined,
  key: string,
  fallback: readonly string[],
) {
  const value = config?.[key];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string')
    return value === 'none'
      ? []
      : value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
  return fallback;
}

/**
 * The active configuration of a detector (`transhipment`, `anomaly`, `dark`, `geofence`,
 * `fishing`), so rule explanations show the thresholds the service really uses; the defaults of
 * the surveillance README apply until the catalogue loads (or when a value is missing).
 */
export function useDetectorThresholds(id: string): DetectorThresholds {
  const detectors = useDetectors();
  return useMemo(() => {
    const detector = detectors.data?.find((item) => item.id === id);
    const config = detector?.config ?? null;
    return {
      detector,
      enabled: detectors.isPending || detectors.isError ? true : (detector?.enabled ?? false),
      number: (key, fallback) => readNumber(config, key, fallback),
      list: (key, fallback) => readList(config, key, fallback),
    };
  }, [detectors.data, detectors.isPending, detectors.isError, id]);
}

/** Text of a detector configuration value (numbers, strings, lists, flags). */
export function configValueText(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => configValueText(item)).join(',');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '';
}

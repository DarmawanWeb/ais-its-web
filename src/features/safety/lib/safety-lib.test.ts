import { describe, expect, it } from 'vitest';

import type { ZoneFeatureCollectionDto } from '@/shared/api/generated/geo/model';
import { ApiProblem } from '@/shared/api/problem';
import type { DetectorDescriptionDto, EncounterDto } from '@/shared/api/generated/safety/model';

import { missingNames } from '../hooks/use-vessel-names';
import {
  bandTicks,
  closestSample,
  compareRiskDesc,
  encounterChartData,
  encounterDurationMin,
  isEncounterActive,
  pairTrackWindow,
  rangeStart,
} from './encounters';
import {
  countByEwsStatus,
  ewsEventFacts,
  formatEwsStatusParam,
  parseEwsStatusParam,
  pipelineNames,
  pipelinePaths,
  pipelinesBounds,
  sortEwsStates,
} from './ews';
import {
  bandOf,
  collisionThresholdsOf,
  DEFAULT_COLLISION_THRESHOLDS,
  DEFAULT_EWS_THRESHOLDS,
  ewsThresholdsOf,
} from './thresholds';
import { localizeProblem } from '@/shared/api/problem-copy';
import { safetyProblemCopies } from './problems';

const detector = (
  id: string,
  config: Record<string, unknown> | null,
  enabled = true,
): DetectorDescriptionDto => ({
  id,
  domain: 'safety',
  methodIds: [],
  alertTypes: [id],
  enabled,
  config,
  tickIntervalMs: null,
});

const sample = (time: string, cpaNm: number, tcpaMin: number | null, risk = 'medium') =>
  ({
    time,
    cpaNm,
    tcpaMin,
    rangeNm: 1,
    risk,
    positions: {
      a: { mmsi: 1, time, lat: 1, lon: 103, sog: 10, cog: 90 },
      b: { mmsi: 2, time, lat: 1.01, lon: 103.01, sog: 10, cog: 270 },
    },
  }) as EncounterDto['history'][number];

describe('detector thresholds', () => {
  it('reads the active EWS thresholds and falls back to the defaults', () => {
    expect(ewsThresholdsOf([detector('ews', { DANGER_M: 400, WARNING_M: '1500' })])).toEqual({
      dangerM: 400,
      warningM: 1500,
      source: 'detector',
    });
    expect(ewsThresholdsOf(undefined)).toBe(DEFAULT_EWS_THRESHOLDS);
    expect(ewsThresholdsOf([detector('ews', { DANGER_M: 2000, WARNING_M: 1000 })])).toBe(
      DEFAULT_EWS_THRESHOLDS,
    );
    expect(ewsThresholdsOf([detector('ews', { DANGER_M: 400, WARNING_M: 1500 }, false)])).toBe(
      DEFAULT_EWS_THRESHOLDS,
    );
  });

  it('reads the collision bands, keeping defaults for missing keys', () => {
    const thresholds = collisionThresholdsOf([
      detector('collision', { HIGH_CPA_NM: 0.3, HYSTERESIS: 0.1 }),
    ]);
    expect(thresholds.high).toEqual({ cpaNm: 0.3, tcpaMin: 6 });
    expect(thresholds.hysteresis).toBe(0.1);
    expect(thresholds.source).toBe('detector');
    expect(collisionThresholdsOf([])).toBe(DEFAULT_COLLISION_THRESHOLDS);
  });

  it('classifies a sample into a band (no hysteresis)', () => {
    expect(bandOf(0.1, 3)).toBe('high');
    expect(bandOf(0.1, 8)).toBe('medium');
    expect(bandOf(0.8, 15)).toBe('low');
    expect(bandOf(0.8, 25)).toBe('none');
    expect(bandOf(0.1, -2)).toBe('none');
    expect(bandOf(0.1, null)).toBe('none');
  });
});

describe('encounters', () => {
  const encounter: EncounterDto = {
    encounterId: 'e1',
    mmsiA: 1,
    mmsiB: 2,
    vesselA: null,
    vesselB: null,
    messageKey: 'safety.collision.encounter',
    messageParams: {},
    startedAt: '2026-11-22T10:00:00.000Z',
    lastSampleAt: '2026-11-22T10:20:00.000Z',
    peakRisk: 'high',
    minCpaNm: 0.1,
    history: [
      sample('2026-11-22T10:20:00.000Z', 0.12, 2),
      sample('2026-11-22T10:00:00.000Z', 0.8, 20, 'low'),
      sample('2026-11-22T10:10:00.000Z', 0.1, 5, 'high'),
    ],
  };

  it('finds the closest sample, the duration and the activity', () => {
    expect(closestSample(encounter)?.cpaNm).toBe(0.1);
    expect(closestSample({ history: [] })).toBeNull();
    expect(encounterDurationMin(encounter)).toBe(20);
    expect(isEncounterActive(encounter, Date.parse('2026-11-22T10:22:00.000Z'))).toBe(true);
    expect(isEncounterActive(encounter, Date.parse('2026-11-22T11:00:00.000Z'))).toBe(false);
  });

  it('orders chart points by time', () => {
    expect(encounterChartData(encounter.history).map((p) => p.cpaNm)).toEqual([0.8, 0.1, 0.12]);
  });

  it('sorts risks highest first and builds the pair track window', () => {
    expect(['low', 'high', 'medium'].sort(compareRiskDesc)).toEqual(['high', 'medium', 'low']);
    const window = pairTrackWindow(encounter, 15);
    expect(window.from).toBe('2026-11-22T09:45:00.000Z');
    expect(Date.parse(window.to)).toBeLessThanOrEqual(Date.now());
    expect(rangeStart('1h', Date.parse('2026-11-22T10:00:00.000Z'))).toBe(
      '2026-11-22T09:00:00.000Z',
    );
  });
});

describe('EWS helpers', () => {
  it('parses and formats the status filter', () => {
    expect(parseEwsStatusParam(null)).toEqual([0, 1]);
    expect(parseEwsStatusParam('3,0,9,0')).toEqual([0, 3]);
    expect(parseEwsStatusParam('x')).toEqual([0, 1]);
    expect(formatEwsStatusParam([1, 0])).toBeNull();
    expect(formatEwsStatusParam([3, 0, 1])).toBe('0,1,3');
  });

  it('sorts danger first and nearest first, and counts statuses', () => {
    const states = [
      { mmsi: 3, ewsStatus: 3 as const, pipelineDistanceM: 50 },
      { mmsi: 2, ewsStatus: 1 as const, pipelineDistanceM: 900 },
      { mmsi: 1, ewsStatus: 1 as const, pipelineDistanceM: 600 },
      { mmsi: 4, ewsStatus: 0 as const, pipelineDistanceM: null },
    ];
    expect(sortEwsStates(states).map((s) => s.mmsi)).toEqual([4, 1, 2, 3]);
    expect(countByEwsStatus(states)).toEqual({ danger: 1, warning: 2, safe: 1 });
  });

  it('extracts pipeline paths, names and bounds from the zones GeoJSON', () => {
    const collection = {
      features: [
        {
          type: 'Feature',
          id: 'p1',
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [103, 1],
                [104, 1.5],
              ],
              [[103.5, 0.5]],
            ],
          },
          properties: { id: 'p1', name: 'Pipa A', global: true },
        },
        {
          type: 'Feature',
          id: 'z1',
          geometry: { type: 'Polygon', coordinates: [] },
          properties: { id: 'z1', name: 'Zona', global: true },
        },
      ],
    } as unknown as ZoneFeatureCollectionDto;
    const paths = pipelinePaths(collection);
    expect(paths).toHaveLength(1);
    expect(paths[0]?.path).toEqual([
      [103, 1],
      [104, 1.5],
    ]);
    expect(pipelineNames(collection).get('p1')).toBe('Pipa A');
    expect(pipelinesBounds(collection)).toEqual([
      [103, 1],
      [104, 1.5],
    ]);
    expect(pipelinesBounds(undefined)).toBeNull();
  });
});

describe('event summaries, axis ticks, names and problems', () => {
  it('reads the facts of an EWS event for a localized summary', () => {
    expect(
      ewsEventFacts({
        ewsStatus: 0,
        pipelineDistanceM: 103.4,
        zoneName: ' Pipa Gas Batam ',
        thresholds: { dangerM: 500, warningM: 1750 },
      }),
    ).toEqual({ distanceM: 103.4, pipeline: 'Pipa Gas Batam', status: 0, thresholdM: 500 });
    expect(ewsEventFacts({ ewsStatus: 1, pipelineDistanceM: 610 })).toEqual({
      distanceM: 610,
      pipeline: null,
      status: 1,
      thresholdM: null,
    });
    expect(ewsEventFacts({ risk: 'high' })).toBeNull();
    expect(ewsEventFacts(null)).toBeNull();
  });

  it('puts axis ticks on the band limits and keeps the maximum apart from them', () => {
    expect(bandTicks([0.25, 0.5, 1], 0, 1.5)).toEqual([0, 0.25, 0.5, 1, 1.5]);
    expect(bandTicks([0.25, 0.5, 1], 0, 1.05)).toEqual([0, 0.25, 0.5, 1]);
    expect(bandTicks([0, 6, 12, 20], -5, 25)).toEqual([-5, 0, 6, 12, 20, 25]);
  });

  it('looks up only unknown names, once each and capped', () => {
    const known = new Set([1, 2]);
    expect(missingNames([3, 1, 3, 4, 2, 5], (m) => known.has(m))).toEqual([3, 4, 5]);
    expect(missingNames([9, 8, 7, 6], () => false, 2)).toEqual([8, 9]);
  });

  it('translates known problem codes and keeps the support details', () => {
    const t = (key: string) => `t:${key}`;
    const problem = new ApiProblem({
      kind: 'http',
      status: 400,
      code: 'VALIDATION_FAILED',
      title: 'Validation failed',
      traceId: 'abc',
      errors: [{ field: 'from', message: 'at most 31 days' }],
    });
    const localized = localizeProblem(problem, safetyProblemCopies(t));
    expect(localized?.title).toBe('t:problems.validation');
    expect(localized?.detail).toBe('t:problems.validationDetail');
    expect(localized?.traceId).toBe('abc');
    expect(localized?.errors).toHaveLength(1);
    const other = new ApiProblem({
      kind: 'http',
      status: 409,
      code: 'CONFLICT',
      title: 'Conflict',
    });
    expect(localizeProblem(other, safetyProblemCopies(t))).toBe(other);
    expect(localizeProblem(undefined, {})).toBeUndefined();
  });
});

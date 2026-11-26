import { describe, expect, it } from 'vitest';

import type { FleetVesselCiiDto, SegmentDto } from '@/shared/api/generated/emission/model';
import { ApiProblem } from '@/shared/api/problem';

import { parseDecimal, toInputNumber } from './decimal';
import { toFleetRows } from './fleet-rows';
import {
  domainBands,
  domainPosition,
  gradeShares,
  markerLayout,
  needsAction,
  niceAxis,
  ratingTrend,
  requiredOf,
  scaleDomain,
} from './grades';
import { ciiProblemKey, isCiiNotAvailable } from './problems';
import { parseJobError, recomputeRangeIssue } from './recompute';
import { changedItems, nextYear, rowIssues, rowsOf } from './reduction-factors';
import {
  clampSegmentRange,
  methodShares,
  segmentMethodId,
  segmentMinutes,
  segmentsUseWeather,
  usesWeather,
} from './segments';
import { parseYear, yearFraction, yearOptions, yearRange } from './years';

const DD = { d1: 5.55, d2: 6.3, d3: 7.32, d4: 8.67 };

function problem(status: number, code: string) {
  return new ApiProblem({ kind: 'http', status, code, title: code });
}

describe('rating scale geometry', () => {
  it('shows B–D in full with A and E as margins, widened for outlying values', () => {
    const domain = scaleDomain(DD, [6.44, 6.77]);
    const margin = (DD.d4 - DD.d1) * 0.6;
    expect(domain.min).toBeCloseTo(DD.d1 - margin);
    expect(domain.max).toBeCloseTo(DD.d4 + margin);
    expect(scaleDomain(DD, [1]).min).toBeLessThan(1);
    expect(scaleDomain(DD, [14]).max).toBeGreaterThan(14);
    expect(scaleDomain(DD, [0.1], 0.6).min).toBeGreaterThanOrEqual(0);
  });

  it('builds contiguous bands and clamps positions to [0, 1]', () => {
    const domain = { min: 4, max: 10 };
    const bands = domainBands(DD, domain);
    expect(bands.map((band) => band.grade)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(bands[0]).toEqual({ grade: 'A', from: 4, to: 5.55 });
    expect(bands[4]).toEqual({ grade: 'E', from: 8.67, to: 10 });
    expect(domainPosition(7, domain)).toBeCloseTo(0.5);
    expect(domainPosition(2, domain)).toBe(0);
    expect(domainPosition(42, domain)).toBe(1);
    expect(domainPosition(Number.NaN, domain)).toBe(0);
  });

  it('lays out close marker labels back to back, near the ends inwards, else on two rows', () => {
    expect(markerLayout([0.3, 0.8])).toEqual([
      { anchor: 'center', row: 0 },
      { anchor: 'center', row: 0 },
    ]);
    expect(markerLayout([0.45, 0.5])).toEqual([
      { anchor: 'end', row: 0 },
      { anchor: 'start', row: 0 },
    ]);
    // Input order does not matter: the right-most marker gets "start".
    expect(markerLayout([0.5, 0.45])).toEqual([
      { anchor: 'start', row: 0 },
      { anchor: 'end', row: 0 },
    ]);
    expect(markerLayout([0.05, 0.95])).toEqual([
      { anchor: 'start', row: 0 },
      { anchor: 'end', row: 0 },
    ]);
    expect(markerLayout([0.05, 0.1])).toEqual([
      { anchor: 'start', row: 0 },
      { anchor: 'start', row: 1 },
    ]);
  });

  it('rounds an axis to 1/2/5 steps with ticks', () => {
    expect(niceAxis({ min: 4.46, max: 9.76 }, 6)).toEqual({
      min: 4,
      max: 10,
      ticks: [4, 5, 6, 7, 8, 9, 10],
    });
    expect(niceAxis({ min: 0.4, max: 1.3 }, 4).ticks).toEqual([0, 0.5, 1, 1.5]);
    expect(niceAxis({ min: 3, max: 3 })).toEqual({ min: 3, max: 3, ticks: [3, 3] });
  });
});

describe('grades and trends', () => {
  it('computes shares, actions and the required CII', () => {
    const shares = gradeShares({ A: 1, B: 1, C: 2, D: 0, E: 0 });
    expect(shares.find((share) => share.grade === 'C')).toEqual({
      grade: 'C',
      count: 2,
      share: 0.5,
    });
    expect(gradeShares(null).every((share) => share.share === 0)).toBe(true);
    expect(needsAction({ A: 0, B: 0, C: 1, D: 2, E: 1 })).toBe(3);
    expect(requiredOf(6.44, 0.95)).toBeCloseTo(6.778947);
    expect(requiredOf(6.44, 0)).toBeNull();
    expect(requiredOf(null, 0.95)).toBeNull();
  });

  it('reads a lower rating as better', () => {
    const better = ratingTrend(0.95, 1);
    expect(better?.direction).toBe('better');
    expect(better?.percent).toBeCloseTo(-5);
    expect(ratingTrend(1.05, 1)).toMatchObject({ direction: 'worse' });
    expect(ratingTrend(1.001, 1)?.direction).toBe('same');
    expect(ratingTrend(1, null)).toBeNull();
    expect(ratingTrend(1, 0)).toBeNull();
  });

  it('joins the previous year by MMSI and recovers the required CII', () => {
    const item = (mmsi: number, rating: number | null): FleetVesselCiiDto => ({
      mmsi,
      vesselId: `v${mmsi}`,
      name: `Vessel ${mmsi}`,
      grade: rating === null ? null : 'C',
      rating,
      attained: rating === null ? null : rating * 10,
      source: rating === null ? null : 'segments',
      imo: null,
      typeCode: 'bulk_carrier',
      required: null,
      zPercent: null,
      previousYear: null,
    });
    const rows = toFleetRows([item(1, 0.95), item(2, null)], [item(1, 1)]);
    expect(rows[0]?.required).toBeCloseTo(10);
    expect(rows[0]?.previous?.rating).toBe(1);
    expect(rows[1]).toMatchObject({ required: null, previous: null });
  });
});

describe('numbers typed by users', () => {
  it('accepts both decimal conventions and rejects ambiguous input', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('12.5')).toBe(12.5);
    expect(parseDecimal('1.234,5')).toBe(1234.5);
    expect(parseDecimal('1,234.5')).toBe(1234.5);
    expect(parseDecimal(' 7 ')).toBe(7);
    expect(parseDecimal('')).toBeNaN();
    expect(parseDecimal('1,2,3')).toBeNaN();
    expect(parseDecimal('abc')).toBeNaN();
    expect(toInputNumber(13.625)).toBe('13.625');
    expect(toInputNumber(0.1 + 0.2)).toBe('0.3');
    expect(toInputNumber(null)).toBe('');
  });
});

describe('problems', () => {
  it('maps emission error codes to messages', () => {
    expect(ciiProblemKey(problem(404, 'CII_NOT_AVAILABLE'))).toBe('notAvailable');
    expect(ciiProblemKey(problem(409, 'RECOMPUTE_IN_PROGRESS'))).toBe('recomputeInProgress');
    expect(ciiProblemKey(problem(422, 'REDUCTION_FACTOR_MISSING'))).toBe('reductionFactorMissing');
    expect(ciiProblemKey(problem(403, 'SOMETHING_ELSE'))).toBe('forbidden');
    expect(ciiProblemKey(problem(500, 'INTERNAL_ERROR'))).toBeNull();
    expect(ciiProblemKey(new Error('x'))).toBeNull();
    expect(isCiiNotAvailable(problem(404, 'CII_NOT_AVAILABLE'))).toBe(true);
    expect(isCiiNotAvailable(problem(404, 'VESSEL_NOT_FOUND'))).toBe(false);
  });
});

describe('recomputation', () => {
  const now = new Date('2026-11-22T12:00:00Z');
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

  it('validates the range before POST …/recompute', () => {
    expect(recomputeRangeIssue(hoursAgo(24), now, now)).toBeNull();
    expect(recomputeRangeIssue(new Date('nope'), now, now)).toBe('invalid');
    expect(recomputeRangeIssue(now, hoursAgo(1), now)).toBe('order');
    expect(recomputeRangeIssue(hoursAgo(2), hoursAgo(-2), now)).toBe('future');
    expect(recomputeRangeIssue(hoursAgo(24 * 9), hoursAgo(1), now)).toBe('tooLong');
    expect(recomputeRangeIssue(hoursAgo(24 * 8), hoursAgo(24 * 7.5), now)).toBe('tooOld');
  });

  it('splits job errors into code and message', () => {
    expect(parseJobError('NO_POSITIONS: stream purged')).toEqual({
      code: 'NO_POSITIONS',
      message: 'stream purged',
    });
    expect(parseJobError('plain failure')).toEqual({ code: null, message: 'plain failure' });
    expect(parseJobError(null)).toBeNull();
  });
});

describe('reduction factor editor', () => {
  const stored = [
    { year: 2027, zPercent: 13.625, source: 'IMO MEPC.400(83)' },
    { year: 2026, zPercent: 11, source: 'IMO MEPC.338(76)' },
  ];

  it('validates rows like the API (year 2019–2100 unique, 0 ≤ Z ≤ 99.999, source)', () => {
    expect(rowIssues({ year: '2031', zPercent: '24,125', source: 'MEPC' }, ['2031'])).toEqual([]);
    expect(rowIssues({ year: '2018', zPercent: '5', source: 'x' }, [])).toEqual(['year']);
    expect(rowIssues({ year: '2030', zPercent: '5', source: 'x' }, ['2030', '2030'])).toEqual([
      'duplicate',
    ]);
    expect(rowIssues({ year: '2030', zPercent: '100', source: ' ' }, ['2030'])).toEqual([
      'z',
      'source',
    ]);
  });

  it('sends only new and changed years', () => {
    const rows = rowsOf(stored);
    expect(rows.map((row) => row.year)).toEqual(['2026', '2027']);
    expect(changedItems(rows)).toEqual([]);
    const edited = rows.map((row) => (row.year === '2027' ? { ...row, zPercent: '14' } : row));
    edited.push({
      key: 'new',
      year: '2031',
      zPercent: '24,125',
      source: ' MEPC ',
      isNew: true,
    });
    expect(changedItems(edited)).toEqual([
      { year: 2027, zPercent: 14, source: 'IMO MEPC.400(83)' },
      { year: 2031, zPercent: 24.125, source: 'MEPC' },
    ]);
    expect(nextYear(rows)).toBe(2030);
    expect(nextYear(edited)).toBe(2032);
  });
});

describe('segments', () => {
  const segment = (patch: Partial<SegmentDto>): SegmentDto => ({
    timeStart: '2026-11-22T00:00:00Z',
    timeEnd: '2026-11-22T00:12:00Z',
    mmsi: 525005223,
    vesselId: 'v1',
    distanceNm: 2.5,
    speedKn: 12.5,
    fuelMeTon: 0.1,
    fuelAeTon: 0.02,
    co2Ton: 0.38,
    method: 'first_formula',
    navstatus: 0,
    fuelCode: 'HFO',
    conversionFactor: 3.114,
    weather: null,
    flags: [],
    ...patch,
  });

  it('names the fuel method of a segment and its methodology id', () => {
    expect(segmentMethodId('telemetry')).toBe('telemetry.fuel_reading_usage');
    expect(segmentMethodId('first_formula')).toBe('fuel.first_formula');
    expect(segmentMethodId('holtrop')).toBe('fuel.second_formula_me');
    expect(segmentMethodId('none')).toBe('fuel.method_selection');
    expect(segmentMinutes(segment({}))).toBe(12);
  });

  it('detects weather-derived figures for the Open-Meteo attribution', () => {
    expect(usesWeather({ telemetry: 1, firstFormula: 2, holtrop: 0 })).toBe(false);
    expect(usesWeather({ telemetry: 0, firstFormula: 0, holtrop: 3 })).toBe(true);
    expect(segmentsUseWeather([segment({})])).toBe(false);
    expect(segmentsUseWeather([segment({ method: 'holtrop' })])).toBe(true);
    const shares = methodShares({ telemetry: 1, firstFormula: 1, holtrop: 2 });
    expect(shares.map((item) => item.share)).toEqual([0.25, 0.25, 0.5]);
  });

  it('clamps ranges to 31 days', () => {
    const to = new Date('2026-11-22T00:00:00Z');
    const from = new Date('2026-09-01T00:00:00Z');
    expect(clampSegmentRange(from, to).from.toISOString()).toBe('2026-10-22T00:00:00.000Z');
  });
});

describe('calendar years (CII aggregation unit)', () => {
  const now = new Date('2026-07-02T12:00:00Z');

  it('lists and parses years', () => {
    expect(yearOptions(now)).toEqual([2026, 2025, 2024, 2023]);
    expect(parseYear('2024', 2026)).toBe(2024);
    expect(parseYear('24', 2026)).toBe(2026);
    expect(parseYear('2300', 2026)).toBe(2026);
    expect(parseYear(null, 2026)).toBe(2026);
  });

  it('caps the current year at now and measures its elapsed fraction', () => {
    expect(yearRange(2025, now)).toEqual({
      from: '2025-01-01T00:00:00.000Z',
      to: '2026-01-01T00:00:00.000Z',
    });
    expect(yearRange(2026, now).to).toBe(now.toISOString());
    expect(yearFraction(2026, now)).toBeCloseTo(0.5, 1);
    expect(yearFraction(2025, now)).toBe(1);
  });
});

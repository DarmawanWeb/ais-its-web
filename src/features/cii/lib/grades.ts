import { CII_GRADES, type CiiGrade } from '@darmawanweb/ais-its-contracts/domain';

import type { DdVectorDto, GradeCountsDto } from '@/shared/api/generated/emission/model';

export { CII_GRADES, type CiiGrade };

/** One band of the A–E rating scale in the unit of the attained CII. */
export interface GradeBand {
  grade: CiiGrade;
  from: number;
  to: number;
}

export function isGrade(value: unknown): value is CiiGrade {
  return typeof value === 'string' && (CII_GRADES as readonly string[]).includes(value);
}

/** 0 for A … 4 for E (lower is better). */
export function gradeRank(grade: CiiGrade): number {
  return CII_GRADES.indexOf(grade);
}

/**
 * Upper end of a rating-scale axis: 25 % above the E boundary (d4 × required) so the E band
 * stays visible, or above the largest plotted value when that is higher.
 */
export function scaleMax(dd: DdVectorDto | null | undefined, values: readonly number[]): number {
  const finite = values.filter((value) => Number.isFinite(value) && value > 0);
  const largest = finite.length > 0 ? Math.max(...finite) : 0;
  const fromBands = dd ? dd.d4 * 1.25 : 0;
  const max = Math.max(fromBands, largest * 1.1);
  return max > 0 ? max : 1;
}

/**
 * Absolute A–E bands of a year: [0, d1], (d1, d2], (d2, d3], (d3, d4], (d4, max] where the
 * boundaries are d_i × required (legacy ddVector, IMO MEPC.354(78)).
 */
export function gradeBands(dd: DdVectorDto, max: number): GradeBand[] {
  const edges = [0, dd.d1, dd.d2, dd.d3, dd.d4, Math.max(max, dd.d4)];
  return CII_GRADES.map((grade, index) => ({
    grade,
    from: edges[index] ?? 0,
    to: edges[index + 1] ?? max,
  }));
}

/** Position of `value` on a [0, max] scale as a fraction in [0, 1]. */
export function scalePosition(value: number, max: number): number {
  if (!Number.isFinite(value) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/** Visible range of the rating scale bar in the unit of the attained CII. */
export interface ScaleDomain {
  min: number;
  max: number;
}

/**
 * Domain of a rating scale: the B–D bands in full and A and E as open-ended margins of
 * `marginShare` × the B–D width (the A band would otherwise take most of the axis), widened to
 * keep every plotted value visible.
 */
export function scaleDomain(
  dd: DdVectorDto,
  values: readonly number[],
  marginShare = 0.6,
): ScaleDomain {
  const span = Math.max(dd.d4 - dd.d1, dd.d4 * 0.05, Number.EPSILON);
  const margin = span * marginShare;
  let min = Math.max(0, dd.d1 - margin);
  let max = dd.d4 + margin;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = Math.max(0, value - margin * 0.3);
    if (value > max) max = value + margin * 0.3;
  }
  return { min, max };
}

/** Bands of the scale bar: [min, d1], (d1, d2], (d2, d3], (d3, d4], (d4, max]. */
export function domainBands(dd: DdVectorDto, domain: ScaleDomain): GradeBand[] {
  const edges = [domain.min, dd.d1, dd.d2, dd.d3, dd.d4, domain.max];
  return CII_GRADES.map((grade, index) => ({
    grade,
    from: edges[index] ?? domain.min,
    to: edges[index + 1] ?? domain.max,
  }));
}

/** Position of `value` in a scale domain as a fraction in [0, 1]. */
export function domainPosition(value: number, domain: ScaleDomain): number {
  const width = domain.max - domain.min;
  if (!Number.isFinite(value) || width <= 0) return 0;
  return Math.min(1, Math.max(0, (value - domain.min) / width));
}

export type MarkerAnchor = 'start' | 'center' | 'end';

export interface MarkerLayout {
  /** Where the label sits relative to its line: after it, centred on it, or before it. */
  anchor: MarkerAnchor;
  /** Label row above the bar (0 = nearest to the title, 1 = second row). */
  row: number;
}

/**
 * Label layout of scale markers (positions in [0, 1]) so that labels never overlap: labels
 * near an end of the bar grow inwards; two close markers put their labels back to back (the
 * left one before its line, the right one after it), or on two rows when that does not fit.
 */
export function markerLayout(positions: readonly number[], minGap = 0.2): MarkerLayout[] {
  const layout: MarkerLayout[] = positions.map((position) => ({
    anchor: position < 0.12 ? 'start' : position > 0.88 ? 'end' : 'center',
    row: 0,
  }));
  const order = positions
    .map((position, index) => ({ position, index }))
    .sort((a, b) => a.position - b.position);
  for (let k = 1; k < order.length; k += 1) {
    const left = order[k - 1];
    const right = order[k];
    if (!left || !right || right.position - left.position >= minGap) continue;
    const leftLayout = layout[left.index];
    const rightLayout = layout[right.index];
    if (!leftLayout || !rightLayout || leftLayout.row !== rightLayout.row) continue;
    if (left.position >= 0.25 && right.position <= 0.75) {
      leftLayout.anchor = 'end';
      rightLayout.anchor = 'start';
    } else {
      rightLayout.row = leftLayout.row + 1;
    }
  }
  return layout;
}

/** A "nice" axis around a domain: round step (1, 2 or 5 × 10^n) and ticks from min to max. */
export function niceAxis(
  domain: ScaleDomain,
  count = 5,
): { min: number; max: number; ticks: number[] } {
  const width = domain.max - domain.min;
  if (!(width > 0) || !Number.isFinite(width)) {
    return { min: domain.min, max: domain.max, ticks: [domain.min, domain.max] };
  }
  const raw = width / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  const min = Math.max(0, Math.floor(domain.min / step) * step);
  const max = Math.ceil(domain.max / step) * step;
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return { min, max, ticks };
}

/** Required CII recovered from attained and rating (rating = attained / required). */
export function requiredOf(
  attained: number | null | undefined,
  rating: number | null | undefined,
): number | null {
  if (attained === null || attained === undefined || !rating || !Number.isFinite(rating)) {
    return null;
  }
  return attained / rating;
}

export interface GradeShare {
  grade: CiiGrade;
  count: number;
  /** Share of the vessels with a grade (0–1). */
  share: number;
}

/** Count and share of every grade, in A–E order. */
export function gradeShares(grades: GradeCountsDto | null | undefined): GradeShare[] {
  const total = CII_GRADES.reduce((sum, grade) => sum + (grades?.[grade] ?? 0), 0);
  return CII_GRADES.map((grade) => {
    const count = grades?.[grade] ?? 0;
    return { grade, count, share: total > 0 ? count / total : 0 };
  });
}

export interface RatingTrend {
  /** better = the rating went down (less CO2 per capacity-mile). */
  direction: 'better' | 'worse' | 'same';
  /** current − previous rating. */
  delta: number;
  /** Relative change of the rating in percent. */
  percent: number;
}

/** Change of the rating against the previous year; a lower rating is better. */
export function ratingTrend(
  current: number | null | undefined,
  previous: number | null | undefined,
  tolerance = 0.005,
): RatingTrend | null {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }
  const delta = current - previous;
  const direction = Math.abs(delta) < tolerance ? 'same' : delta < 0 ? 'better' : 'worse';
  return { direction, delta, percent: (delta / previous) * 100 };
}

/** Vessels that need a corrective action plan in the SEEMP (grade D or E, MARPOL VI reg. 28). */
export function needsAction(grades: GradeCountsDto | null | undefined): number {
  return (grades?.D ?? 0) + (grades?.E ?? 0);
}

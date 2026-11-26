import { CII_GRADES, type CiiGrade } from '@darmawanweb/ais-its-contracts/domain';

export { CII_GRADES, type CiiGrade };

export function isGrade(value: unknown): value is CiiGrade {
  return typeof value === 'string' && (CII_GRADES as readonly string[]).includes(value);
}

/** Grade change between two grades: positive = better (e.g. D → B is +2). */
export function gradeSteps(before: CiiGrade | null, after: CiiGrade | null): number | null {
  if (!before || !after) return null;
  return CII_GRADES.indexOf(before) - CII_GRADES.indexOf(after);
}

/** SEEMP planning priority of a vessel from its current CII grade (MARPOL Annex VI reg. 28). */
export type SeempPriority = 'corrective' | 'monitor' | 'compliant' | 'noData';

/**
 * D or E needs a corrective action plan in the SEEMP (E at once, D after three consecutive
 * years); C meets the requirement with no margin; A and B are on track.
 */
export function seempPriority(grade: unknown): SeempPriority {
  if (!isGrade(grade)) return 'noData';
  if (grade === 'D' || grade === 'E') return 'corrective';
  return grade === 'C' ? 'monitor' : 'compliant';
}

/** Vessels rated D or E in a grade distribution. */
export function correctiveCount(grades: Partial<Record<CiiGrade, number>> | null | undefined) {
  return (grades?.D ?? 0) + (grades?.E ?? 0);
}

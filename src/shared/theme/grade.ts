import type { CiiGrade } from '@darmawanweb/ais-its-contracts/domain';

/** Background of a CII grade (the fixed IMO scale of `CII_GRADE_COLORS`, both themes). */
export const CII_GRADE_BG: Readonly<Record<CiiGrade, string>> = {
  A: 'bg-grade-a',
  B: 'bg-grade-b',
  C: 'bg-grade-c',
  D: 'bg-grade-d',
  E: 'bg-grade-e',
};

/**
 * Text on a grade colour: white on A and E, near-black on B, C and D — the only pairs that
 * reach WCAG AA (≥ 4.5:1) on #65a30d, #ca8a04 and #ea580c.
 */
export const CII_GRADE_TEXT: Readonly<Record<CiiGrade, string>> = {
  A: 'text-white',
  B: 'text-black',
  C: 'text-black',
  D: 'text-black',
  E: 'text-white',
};

/** Background and readable text classes of a grade chip (`<span className={gradeClassName(g)}>`). */
export function gradeClassName(grade: CiiGrade): string {
  return `${CII_GRADE_BG[grade]} ${CII_GRADE_TEXT[grade]}`;
}

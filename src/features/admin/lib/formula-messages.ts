import type { TFunction } from 'i18next';

import {
  FUEL_FORMULA_MAX_DEPTH,
  FUEL_FORMULA_MAX_LENGTH,
  FUEL_FORMULA_MAX_TOKENS,
  type FuelFormulaIssue,
} from '@/shared/lib/fuel-formula';

/** Translated message (`admin:formula.problems.<code>`) of a fuel formula grammar problem. */
export function formulaProblemMessage(t: TFunction, issue: FuelFormulaIssue): string {
  return t(`formula.problems.${issue.code}`, {
    token: 'text' in issue ? issue.text : '',
    position: issue.position + 1,
    expected: 'expected' in issue ? issue.expected : 0,
    actual: 'actual' in issue ? issue.actual : 0,
    max:
      issue.code === 'tooLong'
        ? FUEL_FORMULA_MAX_LENGTH
        : issue.code === 'tooManyTokens'
          ? FUEL_FORMULA_MAX_TOKENS
          : FUEL_FORMULA_MAX_DEPTH,
  });
}

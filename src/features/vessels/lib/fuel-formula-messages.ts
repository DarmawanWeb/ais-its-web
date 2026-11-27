import type { TFunction } from 'i18next';
import {
  FUEL_FORMULA_MAX_DEPTH,
  FUEL_FORMULA_MAX_LENGTH,
  FUEL_FORMULA_MAX_TOKENS,
  type FuelFormulaIssue,
} from '@/shared/lib/fuel-formula';

type Translate = TFunction;

/** Translated message of a grammar problem, e.g. "Nama tidak dikenal "speed" pada posisi 1". */
export function formulaIssueMessage(issue: FuelFormulaIssue, t: Translate): string {
  return t(`formula.issues.${issue.code}`, {
    ...('text' in issue ? { text: issue.text } : {}),
    ...('expected' in issue ? { expected: issue.expected, actual: issue.actual } : {}),
    position: issue.position + 1,
    max:
      issue.code === 'tooLong'
        ? FUEL_FORMULA_MAX_LENGTH
        : issue.code === 'tooManyTokens'
          ? FUEL_FORMULA_MAX_TOKENS
          : FUEL_FORMULA_MAX_DEPTH,
  });
}

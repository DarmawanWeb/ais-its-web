import {
  evaluateFuelFormula as evaluateAst,
  FUEL_FORMULA_FUNCTIONS,
  FUEL_FORMULA_LIMITS,
  FUEL_FORMULA_VARIABLE,
  FuelFormulaSyntaxError,
  parseFuelFormula,
  type FuelFormulaNode,
} from '@darmawanweb/ais-its-contracts/domain';

/**
 * First fuel formulas (fuel flow of an engine group as a function of `speedKnot`, method
 * `fuel.first_formula`) checked and evaluated with the platform grammar of
 * `@darmawanweb/ais-its-contracts` — the same parser the fleet service runs on write and the
 * emission service evaluates — with the problem as a code for translated messages.
 */
export const FUEL_FORMULA_MAX_LENGTH = FUEL_FORMULA_LIMITS.maxLength;
export const FUEL_FORMULA_MAX_DEPTH = FUEL_FORMULA_LIMITS.maxDepth;
export const FUEL_FORMULA_MAX_TOKENS = FUEL_FORMULA_LIMITS.maxTokens;
export { FUEL_FORMULA_FUNCTIONS, FUEL_FORMULA_VARIABLE, type FuelFormulaNode };

/** Why a formula is not in the grammar (`position` = 0-based character offset). */
export type FuelFormulaIssue =
  | { readonly code: 'tooLong'; readonly position: number }
  | { readonly code: 'empty'; readonly position: number }
  | { readonly code: 'tooManyTokens'; readonly position: number }
  | { readonly code: 'unexpectedCharacter'; readonly position: number; readonly text: string }
  | { readonly code: 'unknownIdentifier'; readonly position: number; readonly text: string }
  | {
      readonly code: 'arity';
      readonly position: number;
      readonly text: string;
      readonly expected: number;
      readonly actual: number;
    }
  | { readonly code: 'tooDeep'; readonly position: number }
  | { readonly code: 'numberOutOfRange'; readonly position: number; readonly text: string }
  | { readonly code: 'expected'; readonly position: number; readonly text: string }
  | { readonly code: 'unexpectedToken'; readonly position: number; readonly text: string }
  | { readonly code: 'unexpectedEnd'; readonly position: number }
  /** A reason this version does not know (newer contracts): `text` is the English reason. */
  | { readonly code: 'syntax'; readonly position: number; readonly text: string };

export type FuelFormulaCheck =
  | { readonly valid: true; readonly ast: FuelFormulaNode }
  | { readonly valid: false; readonly issue: FuelFormulaIssue };

/** Maps a contracts `FuelFormulaSyntaxError` (English `reason`) to a translatable issue. */
export function fuelFormulaIssueOf(reason: string, position: number): FuelFormulaIssue {
  let match: RegExpExecArray | null;
  if (/^Empty formula/.test(reason)) return { code: 'empty', position };
  if (/^Longer than /.test(reason)) return { code: 'tooLong', position };
  if (/^More than \d+ tokens/.test(reason)) return { code: 'tooManyTokens', position };
  if (/^Nested deeper than /.test(reason)) return { code: 'tooDeep', position };
  if ((match = /^Unexpected character (.+)$/.exec(reason))) {
    let text = match[1]!;
    try {
      text = JSON.parse(text) as string;
    } catch {
      // keep the raw text
    }
    return { code: 'unexpectedCharacter', position, text };
  }
  if ((match = /^Number (\S+) is out of range/.exec(reason)))
    return { code: 'numberOutOfRange', position, text: match[1]! };
  if ((match = /^Unknown identifier "([^"]*)"/.exec(reason)))
    return { code: 'unknownIdentifier', position, text: match[1]! };
  if ((match = /^(\w+)\(\) takes (\d+) arguments?, got (\d+)/.exec(reason))) {
    return {
      code: 'arity',
      position,
      text: match[1]!,
      expected: Number(match[2]),
      actual: Number(match[3]),
    };
  }
  if ((match = /^Expected "([^"]*)"/.exec(reason)))
    return { code: 'expected', position, text: match[1]! };
  if (/^Unexpected end of formula/.test(reason)) return { code: 'unexpectedEnd', position };
  if ((match = /^Unexpected "([^"]*)"/.exec(reason)))
    return { code: 'unexpectedToken', position, text: match[1]! };
  return { code: 'syntax', position, text: reason };
}

/** Parses a formula and reports the first problem, exactly like the fleet service on write. */
export function checkFuelFormula(source: string): FuelFormulaCheck {
  try {
    return { valid: true, ast: parseFuelFormula(source) };
  } catch (error) {
    if (error instanceof FuelFormulaSyntaxError)
      return { valid: false, issue: fuelFormulaIssueOf(error.reason, error.position) };
    throw error;
  }
}

/**
 * Value of a valid formula at a speed (knots), as the emission service computes the raw flow
 * f(V) before its `max(f, 0.5)` floor; `null` for invalid formulas or non-finite results.
 */
export function evaluateFuelFormula(source: string, speedKnot: number): number | null {
  const check = checkFuelFormula(source);
  if (!check.valid) return null;
  const value = evaluateAst(check.ast, { speedKnot });
  return Number.isFinite(value) ? value : null;
}

/** Speeds (knots) of a formula preview table. */
export const FUEL_FORMULA_PREVIEW_SPEEDS = [0, 4, 8, 12, 16, 20] as const;

/** Fuel flow (L/min) at the preview speeds (non-finite values are null); null when invalid. */
export function previewFuelFormula(
  source: string,
  speeds: readonly number[] = FUEL_FORMULA_PREVIEW_SPEEDS,
): (number | null)[] | null {
  const check = checkFuelFormula(source);
  if (!check.valid) return null;
  return speeds.map((speedKnot) => {
    const value = evaluateAst(check.ast, { speedKnot });
    return Number.isFinite(value) ? value : null;
  });
}

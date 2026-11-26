import type {
  ReductionFactorDto,
  ReductionFactorInputDto,
} from '@/shared/api/generated/emission/model';

import { parseDecimal, toInputNumber } from './decimal';

/** One editable row of the reduction factor editor (strings as typed). */
export interface FactorRow {
  key: string;
  year: string;
  zPercent: string;
  source: string;
  isNew: boolean;
  original?: ReductionFactorDto;
}

export type FactorRowIssue = 'year' | 'duplicate' | 'z' | 'source';

/** Validation of one row (API: year 2019–2100 unique, 0 ≤ Z ≤ 99.999, source 1–500 chars). */
export function rowIssues(
  row: Pick<FactorRow, 'year' | 'zPercent' | 'source'>,
  years: readonly string[],
): FactorRowIssue[] {
  const issues: FactorRowIssue[] = [];
  const year = Number(row.year);
  if (!/^\d{4}$/.test(row.year) || year < 2019 || year > 2100) issues.push('year');
  else if (years.filter((other) => other === row.year).length > 1) issues.push('duplicate');
  const z = parseDecimal(row.zPercent);
  if (Number.isNaN(z) || z < 0 || z > 99.999) issues.push('z');
  const source = row.source.trim();
  if (source.length < 1 || source.length > 500) issues.push('source');
  return issues;
}

/** Rows that differ from the stored factors (`PUT /reduction-factors` upserts the given years). */
export function changedItems(rows: readonly FactorRow[]): ReductionFactorInputDto[] {
  return rows
    .filter((row) => {
      if (row.isNew || !row.original) return true;
      return (
        Number(row.year) !== row.original.year ||
        parseDecimal(row.zPercent) !== row.original.zPercent ||
        row.source.trim() !== row.original.source
      );
    })
    .map((row) => ({
      year: Number(row.year),
      zPercent: parseDecimal(row.zPercent),
      source: row.source.trim(),
    }));
}

/** Editor rows of the stored factors, oldest year first. */
export function rowsOf(factors: readonly ReductionFactorDto[]): FactorRow[] {
  return [...factors]
    .sort((a, b) => a.year - b.year)
    .map((factor) => ({
      key: String(factor.year),
      year: String(factor.year),
      zPercent: toInputNumber(factor.zPercent),
      source: factor.source,
      isNew: false,
      original: factor,
    }));
}

/** The year a new row starts with: after the last year (at least 2030, the last seeded year). */
export function nextYear(rows: readonly FactorRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.year) || 0), 2029) + 1;
}

/**
 * Parses a decimal typed in either convention: "12.5", "12,5", "1.234,5" (id) or "1,234.5"
 * (en). Returns NaN for anything else (letters, several separators of the same kind…).
 */
export function parseDecimal(input: string): number {
  const value = input.trim().replace(/\s/g, '');
  if (value === '') return Number.NaN;
  if (!/^-?[\d.,]+$/.test(value)) return Number.NaN;
  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');
  let normalized = value;
  if (lastDot >= 0 && lastComma >= 0) {
    // The later separator is the decimal one, the other groups thousands.
    normalized =
      lastComma > lastDot ? value.replaceAll('.', '').replace(',', '.') : value.replaceAll(',', '');
  } else if (lastComma >= 0) {
    if ((value.match(/,/g) ?? []).length > 1) return Number.NaN;
    normalized = value.replace(',', '.');
  } else if ((value.match(/\./g) ?? []).length > 1) {
    return Number.NaN;
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : Number.NaN;
}

/** The value of a number for an input field (no grouping, dot decimal, trimmed zeros). */
export function toInputNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(Number(value.toPrecision(12)));
}

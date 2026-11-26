/** A column of a CSV export: header text and the cell value of a row. */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

/** Rows for `downloadCsv()`: one object per item keyed by the (translated) headers. */
export function toCsvRows<T>(
  items: readonly T[],
  columns: readonly CsvColumn<T>[],
): Record<string, string | number | boolean>[] {
  return items.map((item) =>
    Object.fromEntries(
      columns.map((column) => {
        const value = column.value(item);
        return [column.header, value === null || value === undefined ? '' : value];
      }),
    ),
  );
}

/** Largest number of rows a CSV export collects (cursor pages of 500). */
export const EXPORT_ROW_CAP = 5_000;

/**
 * Collects every item of a cursor-paged list (`{ data, page: { nextCursor } }`) up to `cap`
 * items, following `nextCursor`. Reports whether the cap cut the export.
 */
export async function collectCursorPages<T>(
  fetchPage: (
    cursor: string | undefined,
  ) => Promise<{ data: T[]; page: { nextCursor: string | null } }>,
  cap = EXPORT_ROW_CAP,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchPage(cursor);
    items.push(...page.data);
    if (items.length >= cap) {
      // Exactly `cap` items with no further page is a complete export, not a cut one.
      return {
        items: items.slice(0, cap),
        truncated: items.length > cap || page.page.nextCursor !== null,
      };
    }
    if (!page.page.nextCursor) return { items, truncated: false };
    cursor = page.page.nextCursor;
  }
}

/**
 * Collects every item of a page-based list (`{ data, meta: { page, pageSize, total } }`), up to
 * `cap` items.
 */
export async function collectPages<T>(
  fetchPage: (page: number) => Promise<{ data: T[]; meta: { total: number; pageSize: number } }>,
  cap = EXPORT_ROW_CAP,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  for (let page = 1; ; page += 1) {
    const result = await fetchPage(page);
    items.push(...result.data);
    if (items.length >= cap)
      return { items: items.slice(0, cap), truncated: result.meta.total > cap };
    if (result.data.length === 0 || items.length >= result.meta.total) {
      return { items, truncated: false };
    }
  }
}

/** File name of an export: `<prefix>-<yyyy-mm-dd>.csv`. */
export function exportFileName(prefix: string, now: Date = new Date()): string {
  return `${prefix}-${now.toISOString().slice(0, 10)}.csv`;
}

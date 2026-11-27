/**
 * The alert inbox exports with the notification service's `GET /alerts/export.csv` (streamed,
 * every matching alert up to `ALERT_EXPORT_MAX_ROWS`, headers in `Accept-Language`, formula
 * cells neutralised by the service). These helpers only name the file and count its rows.
 */

/** Data rows of an RFC 4180 export (header excluded; quoted line breaks are not counted). */
export function csvDataRows(text: string): number {
  let rows = 0;
  let quoted = false;
  let empty = true;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') quoted = !quoted;
    if (char === '\n' && !quoted) {
      if (!empty) rows += 1;
      empty = true;
    } else if (char !== '\r') {
      empty = false;
    }
  }
  if (!empty) rows += 1;
  return Math.max(rows - 1, 0);
}

/** `alerts-20261122-1405.csv` (local time of the export) when the service names no file. */
export function exportFileName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `alerts-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
}

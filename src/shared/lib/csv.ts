import Papa from 'papaparse';

/**
 * Downloads rows as a CSV file (UTF-8 with BOM so Excel opens Indonesian text correctly).
 *
 *   downloadCsv('vessels.csv', vessels.map((v) => ({ MMSI: v.mmsi, Name: v.name })));
 */
export function downloadCsv(filename: string, rows: readonly Record<string, unknown>[]): void {
  const csv = Papa.unparse(rows as Record<string, unknown>[], { quotes: false });
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

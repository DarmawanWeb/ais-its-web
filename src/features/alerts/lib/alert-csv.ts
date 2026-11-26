import {
  alertTypeLabel,
  ALERT_SEVERITY_LABELS,
  ALERT_STATUS_LABELS,
} from '@darmawanweb/ais-its-contracts/domain';

import { alertsControllerList } from '@/shared/api/generated/notification/alerts/alerts';
import type {
  AlertDto,
  AlertsControllerListParams,
} from '@/shared/api/generated/notification/model';

/** Most rows of one CSV export (cursor pages of 500, spec §5 `limit` ≤ 500). */
export const CSV_EXPORT_MAX_ROWS = 5_000;
const EXPORT_PAGE_SIZE = 500;

export type CsvLocale = 'id' | 'en';

/** Column headers of the export, in both languages. */
const HEADERS = {
  id: {
    id: 'ID',
    occurredAt: 'Pertama terjadi',
    lastOccurredAt: 'Terakhir terjadi',
    type: 'Tipe',
    domain: 'Domain',
    severity: 'Tingkat',
    status: 'Status',
    mmsi: 'MMSI',
    relatedMmsi: 'MMSI terkait',
    title: 'Judul',
    message: 'Pesan',
    lat: 'Lintang',
    lon: 'Bujur',
    occurrences: 'Kejadian',
    acknowledgedAt: 'Dikonfirmasi',
    resolvedAt: 'Diselesaikan',
    methodId: 'Metode',
  },
  en: {
    id: 'ID',
    occurredAt: 'First occurred',
    lastOccurredAt: 'Last occurred',
    type: 'Type',
    domain: 'Domain',
    severity: 'Severity',
    status: 'Status',
    mmsi: 'MMSI',
    relatedMmsi: 'Related MMSI',
    title: 'Title',
    message: 'Message',
    lat: 'Latitude',
    lon: 'Longitude',
    occurrences: 'Occurrences',
    acknowledgedAt: 'Acknowledged',
    resolvedAt: 'Resolved',
    methodId: 'Method',
  },
} as const satisfies Record<CsvLocale, Record<string, string>>;

/** Neutralises spreadsheet formulas in free text (CSV injection: =, +, -, @ at the start). */
export function csvSafeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Rows of the CSV export (labels in the UI language, times in ISO-8601 UTC). */
export function alertCsvRows(
  alerts: readonly AlertDto[],
  locale: CsvLocale,
): Record<string, unknown>[] {
  const h = HEADERS[locale];
  return alerts.map((alert) => ({
    [h.id]: alert.id,
    [h.occurredAt]: alert.occurredAt,
    [h.lastOccurredAt]: alert.lastOccurredAt,
    [h.type]: alertTypeLabel(alert.type, locale),
    [h.domain]: alert.domain,
    [h.severity]:
      alert.severity in ALERT_SEVERITY_LABELS
        ? ALERT_SEVERITY_LABELS[alert.severity][locale]
        : alert.severity,
    [h.status]:
      alert.status in ALERT_STATUS_LABELS
        ? ALERT_STATUS_LABELS[alert.status][locale]
        : alert.status,
    [h.mmsi]: alert.mmsi,
    [h.relatedMmsi]: alert.relatedMmsi ?? '',
    [h.title]: csvSafeText(alert.title),
    [h.message]: csvSafeText(alert.message),
    [h.lat]: alert.lat ?? '',
    [h.lon]: alert.lon ?? '',
    [h.occurrences]: alert.occurrences,
    [h.acknowledgedAt]: alert.acknowledgedAt ?? '',
    [h.resolvedAt]: alert.resolvedAt ?? '',
    [h.methodId]: alert.methodId,
  }));
}

/**
 * Every alert of the filters, following the cursor pages up to `maxRows`. Returns the alerts
 * and whether more matched than were exported.
 */
export async function fetchAlertsForExport(
  params: Omit<AlertsControllerListParams, 'cursor' | 'limit'>,
  { maxRows = CSV_EXPORT_MAX_ROWS, signal }: { maxRows?: number; signal?: AbortSignal } = {},
): Promise<{ alerts: AlertDto[]; truncated: boolean }> {
  const alerts: AlertDto[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await alertsControllerList(
      {
        ...params,
        limit: Math.min(EXPORT_PAGE_SIZE, maxRows - alerts.length),
        ...(cursor ? { cursor } : {}),
      },
      undefined,
      signal,
    );
    alerts.push(...page.data);
    const next = page.page.nextCursor;
    if (!next) return { alerts, truncated: false };
    if (alerts.length >= maxRows) return { alerts, truncated: true };
    cursor = next;
  }
}

/** `alerts-20261122-1405.csv` (local time of the export). */
export function exportFileName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `alerts-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
}

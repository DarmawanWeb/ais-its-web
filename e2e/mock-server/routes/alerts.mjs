// Notification service (spec §13.9, services/notification/README.md): the alert inbox of the
// alerts feature — `GET /alerts` (cursor pages, filters), `GET /alerts/summary` (open counts,
// replacing the base default with counts derived from these alerts), `GET /alerts/:id`,
// `POST /alerts/:id/ack|resolve` (pushing `alert:updated`) and the delivery log of an alert.
// The initial open alerts match the base summary (1 critical, 2 warning) the smoke test reads.
import { cursorPageOf, MockHttpError, nowIso } from '../lib.mjs';

const MINUTE = 60_000;

const ago = (minutes) => new Date(Date.now() - minutes * MINUTE).toISOString();

/** [id suffix, type, domain, severity, status, mmsi, relatedMmsi, title, message, lat, lon, minutes ago, occurrences, data]. */
const SEED = [
  [
    'a1e01',
    'ews',
    'safety',
    'critical',
    'open',
    525005223,
    null,
    'Bahaya EWS: KM Bahari Nusantara',
    'KM Bahari Nusantara diprediksi berlabuh jangkar 103 m dari Pipa Gas Batam (bahaya di bawah 500 m).',
    1.152,
    103.902,
    6,
    3,
    {
      methodId: 'ews.pipeline_distance_status',
      ewsStatus: 0,
      pipelineDistanceM: 102.6,
      zoneId: '0192f0c8-7d3a-7c2e-9a1d-000000000001',
      thresholds: { dangerM: 500, warningM: 1750 },
    },
  ],
  [
    'a1e02',
    'collision',
    'safety',
    'warning',
    'open',
    525019004,
    563012345,
    'Risiko tubrukan: TB Pelita 5 ↔ Lion City Spirit',
    'CPA 0,06 nm dalam 11,5 menit (pita sedang).',
    1.131,
    103.87,
    14,
    2,
    {
      methodId: 'collision.cpa_tcpa',
      risk: 'medium',
      cpaNm: 0.064,
      tcpaMin: 11.5,
      rangeNm: 8.4,
      encounterId: '0192f0c8-7d3a-7c2e-9a1e-00000000e002',
      thresholds: {
        high: { cpaNm: 0.25, tcpaMin: 6 },
        medium: { cpaNm: 0.5, tcpaMin: 12 },
        low: { cpaNm: 1, tcpaMin: 20 },
        hysteresis: 0.2,
      },
    },
  ],
  [
    'a1e03',
    'dark',
    'surveillance',
    'warning',
    'open',
    538007788,
    null,
    'Kapal gelap: Ocean Bulk Star',
    'Sinyal AIS hilang 42 menit saat berlayar 10,9 kn, 18 km dari pelabuhan terdekat.',
    1.07,
    103.71,
    48,
    1,
    { methodId: 'dark.ais_gap', gapMinutes: 42, sogKn: 10.9 },
  ],
  [
    'a1e04',
    'ews',
    'safety',
    'warning',
    'acknowledged',
    525019003,
    null,
    'Peringatan EWS: KM Kepri Indah',
    'KM Kepri Indah diprediksi berlabuh jangkar 610 m dari Pipa Gas Batam (peringatan di bawah 1.750 m).',
    1.095,
    103.96,
    95,
    4,
    {
      methodId: 'ews.pipeline_distance_status',
      ewsStatus: 1,
      pipelineDistanceM: 610.4,
      thresholds: { dangerM: 500, warningM: 1750 },
    },
  ],
  [
    'a1e05',
    'transhipment',
    'surveillance',
    'critical',
    'acknowledged',
    563045678,
    525019007,
    'Dugaan transhipment ilegal',
    'Pacific Reefer dan MT Gas Riau berdampingan 38 menit di area transhipment Batam (akurasi 87 %).',
    1.226,
    103.962,
    180,
    1,
    { methodId: 'transhipment.accuracy', accuracy: 0.87 },
  ],
  [
    'a1e06',
    'anomaly',
    'surveillance',
    'info',
    'resolved',
    525019006,
    null,
    'Anomali status navigasi: KM Rempang',
    'Melaporkan berlabuh jangkar sambil bergerak 16,4 kn selama 3 posisi.',
    1.02,
    103.93,
    260,
    3,
    { methodId: 'anomaly.navstatus_mismatch' },
  ],
  [
    'a1e07',
    'collision',
    'safety',
    'critical',
    'resolved',
    525019002,
    538007788,
    'Risiko tubrukan tinggi: MT Selat Jaya ↔ Ocean Bulk Star',
    'CPA 0,14 nm dalam 2,4 menit (pita tinggi).',
    1.138,
    103.82,
    180,
    5,
    {
      methodId: 'collision.cpa_tcpa',
      risk: 'high',
      cpaNm: 0.14,
      tcpaMin: 2.4,
      rangeNm: 0.9,
      encounterId: '0192f0c8-7d3a-7c2e-9a1e-00000000e003',
    },
  ],
  [
    'a1e11',
    'collision',
    'safety',
    'critical',
    'acknowledged',
    525019001,
    525019005,
    'Risiko tubrukan tinggi: MV Batam Express ↔ LNG Natuna',
    'CPA 0,06 nm dalam 5,8 menit (pita tinggi).',
    1.205,
    103.83,
    3,
    4,
    {
      methodId: 'collision.cpa_tcpa',
      risk: 'high',
      cpaNm: 0.06,
      tcpaMin: 5.8,
      rangeNm: 3.2,
      encounterId: '0192f0c8-7d3a-7c2e-9a1e-00000000e001',
    },
  ],
  [
    'a1e08',
    'geofence',
    'surveillance',
    'warning',
    'resolved',
    636019900,
    null,
    'Masuk zona terlarang',
    'Car Carrier Aurora memasuki zona terbatas Pulau Nipa.',
    1.164,
    104.05,
    720,
    1,
    { methodId: 'geo.geofence_enter' },
  ],
  [
    'a1e09',
    'fishing',
    'surveillance',
    'info',
    'resolved',
    525019009,
    null,
    'Pola penangkapan ikan',
    'Pola loitering 35 menit di daerah penangkapan ikan Natuna.',
    1.06,
    103.82,
    1500,
    1,
    { methodId: 'fishing.loitering' },
  ],
  [
    'a1e10',
    'ews',
    'safety',
    'warning',
    'resolved',
    525019004,
    null,
    'Peringatan EWS: TB Pelita 5',
    'TB Pelita 5 diprediksi berlabuh jangkar 1.240 m dari Pipa Gas Batam.',
    1.131,
    103.87,
    2900,
    2,
    { methodId: 'ews.pipeline_distance_status', ewsStatus: 1, pipelineDistanceM: 1240 },
  ],
];

const USER_ID = '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6b';

function build() {
  return SEED.map(
    ([
      suffix,
      type,
      domain,
      severity,
      status,
      mmsi,
      relatedMmsi,
      title,
      message,
      lat,
      lon,
      minutesAgo,
      occurrences,
      data,
    ]) => {
      const occurredAt = ago(minutesAgo + occurrences * 3);
      const lastOccurredAt = ago(minutesAgo);
      return {
        id: `0192f0c8-7d3a-7c2e-9a1b-0000000${suffix}`,
        type,
        domain,
        severity,
        status,
        mmsi,
        relatedMmsi,
        orgId: '0192f0c8-7d3a-7c2e-9a1b-000000000001',
        title,
        message,
        lat,
        lon,
        zoneId: data.zoneId ?? null,
        methodId: data.methodId,
        dedupKey: relatedMmsi
          ? `${type}:${Math.min(mmsi, relatedMmsi)}:${Math.max(mmsi, relatedMmsi)}`
          : `${type}:${mmsi}`,
        data,
        source: domain,
        occurrences,
        occurredAt,
        lastOccurredAt,
        acknowledgedBy: status === 'open' ? null : USER_ID,
        acknowledgedAt: status === 'open' ? null : ago(minutesAgo - 2),
        resolvedBy: status === 'resolved' ? USER_ID : null,
        resolvedAt: status === 'resolved' ? ago(minutesAgo - 5) : null,
        updatedAt: lastOccurredAt,
      };
    },
  );
}

let alerts = build();

export function reset() {
  alerts = build();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function findAlert(id) {
  if (!UUID.test(id)) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [{ field: 'id', message: 'must be a UUID' }],
    });
  }
  const alert = alerts.find((a) => a.id === id);
  if (!alert) {
    throw new MockHttpError(404, 'ALERT_NOT_FOUND', 'Alert not found', {
      detail: `No alert ${id}`,
    });
  }
  return alert;
}

/** Fields of an `AlertDto` that the realtime push (`RealtimeAlert`, spec §9) does not carry. */
const NOT_PUSHED = [
  'orgId',
  'dedupKey',
  'source',
  'acknowledgedBy',
  'acknowledgedAt',
  'resolvedBy',
  'resolvedAt',
  'updatedAt',
];

/** `RealtimeAlert` of an alert (spec §9). */
function realtimeOf(alert) {
  return Object.fromEntries(Object.entries(alert).filter(([key]) => !NOT_PUSHED.includes(key)));
}

const DELIVERIES = [
  ['d01', 'a1e01', 'telegram', '-1001234567890', 'sent', 1, null],
  ['d02', 'a1e01', 'email', 'ops@pelni.test', 'queued', 1, null],
  [
    'd03',
    'a1e02',
    'webhook',
    'https://ops.pelni.test/hooks/ais',
    'failed',
    5,
    'HTTP 503 from the receiver',
  ],
];

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/alerts',
    permission: 'alert:read',
    handler: ({ url, send }) => {
      const q = url.searchParams;
      const mmsi = q.get('mmsi') ? Number(q.get('mmsi')) : null;
      const from = q.get('from') ? Date.parse(q.get('from')) : null;
      const to = q.get('to') ? Date.parse(q.get('to')) : null;
      for (const [key, value] of [
        ['from', from],
        ['to', to],
      ]) {
        if (value !== null && Number.isNaN(value)) {
          throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
            errors: [{ field: key, message: 'must be an ISO-8601 date-time' }],
          });
        }
      }
      const items = alerts
        .filter(
          (a) =>
            (!q.get('status') || a.status === q.get('status')) &&
            (!q.get('type') || a.type === q.get('type')) &&
            (!q.get('domain') || a.domain === q.get('domain')) &&
            (!q.get('severity') || a.severity === q.get('severity')) &&
            (mmsi === null || a.mmsi === mmsi || a.relatedMmsi === mmsi) &&
            (from === null || Date.parse(a.occurredAt) >= from) &&
            (to === null || Date.parse(a.occurredAt) <= to),
        )
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      const params = new URL(url);
      for (const key of ['status', 'type', 'domain', 'severity', 'mmsi', 'from', 'to'])
        params.searchParams.delete(key);
      send(200, cursorPageOf(items, params));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/alerts/summary',
    permission: 'alert:read',
    handler: ({ send }) => {
      const open = alerts.filter((a) => a.status === 'open');
      const count = (key, value) => open.filter((a) => a[key] === value).length;
      const byType = Object.fromEntries(
        ['ews', 'collision', 'transhipment', 'anomaly', 'dark', 'geofence', 'fishing'].map((t) => [
          t,
          count('type', t),
        ]),
      );
      send(200, {
        total: open.length,
        bySeverity: {
          info: count('severity', 'info'),
          warning: count('severity', 'warning'),
          critical: count('severity', 'critical'),
        },
        byDomain: {
          safety: count('domain', 'safety'),
          surveillance: count('domain', 'surveillance'),
        },
        byType,
      });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/alerts/:id',
    permission: 'alert:read',
    handler: ({ params, send }) => send(200, findAlert(params.id)),
  },
  {
    method: 'POST',
    path: '/api/v2/alerts/:id/ack',
    permission: 'alert:ack',
    handler: ({ params, claims, send, realtime }) => {
      const alert = findAlert(params.id);
      if (alert.status === 'resolved') {
        throw new MockHttpError(409, 'ALERT_ALREADY_RESOLVED', 'Alert already resolved', {
          detail: `Alert ${alert.id} is resolved`,
        });
      }
      if (alert.status === 'open') {
        Object.assign(alert, {
          status: 'acknowledged',
          acknowledgedBy: claims?.sub ?? null,
          acknowledgedAt: nowIso(),
          updatedAt: nowIso(),
        });
        realtime.alert(realtimeOf(alert), { kind: 'updated' });
      }
      send(200, alert);
    },
  },
  {
    method: 'POST',
    path: '/api/v2/alerts/:id/resolve',
    permission: 'alert:ack',
    handler: ({ params, claims, send, realtime }) => {
      const alert = findAlert(params.id);
      if (alert.status !== 'resolved') {
        Object.assign(alert, {
          status: 'resolved',
          resolvedBy: claims?.sub ?? null,
          resolvedAt: nowIso(),
          updatedAt: nowIso(),
        });
        realtime.alert(realtimeOf(alert), { kind: 'updated' });
      }
      send(200, alert);
    },
  },
  {
    // RegExp: a fallback the alert-rules feature may replace with its own delivery log.
    method: 'GET',
    path: /^\/api\/v2\/notifications\/deliveries$/,
    permission: 'alert_rule:write',
    handler: ({ url, send }) => {
      const alertId = url.searchParams.get('alertId');
      const items = DELIVERIES.filter(([, alert]) => !alertId || alertId.endsWith(alert)).map(
        ([suffix, alert, channel, target, status, attempts, error]) => {
          const parent = alerts.find((a) => a.id.endsWith(alert));
          return {
            id: `0192f0c8-7d3a-7c2e-9a1f-0000000${suffix}00`,
            alertId: parent?.id ?? alert,
            ruleId: '0192f0c8-7d3a-7c2e-9a20-000000000001',
            channel,
            target,
            severity: parent?.severity ?? 'warning',
            status,
            attempts,
            error,
            nextAttemptAt: parent?.lastOccurredAt ?? nowIso(),
            lastAttemptAt: parent?.lastOccurredAt ?? null,
            sentAt: status === 'sent' ? (parent?.lastOccurredAt ?? null) : null,
            createdAt: parent?.lastOccurredAt ?? nowIso(),
          };
        },
      );
      const params = new URL(url);
      for (const key of ['alertId', 'ruleId', 'status']) params.searchParams.delete(key);
      send(200, cursorPageOf(items, params));
    },
  },
];

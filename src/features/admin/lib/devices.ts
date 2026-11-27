import { telemetryMqttTopic } from '@darmawanweb/ais-its-contracts';

/**
 * Telemetry devices (services/telemetry/README.md): `mqtt` devices publish JSON readings to
 * their own MQTT topic `aisits/telemetry/<deviceId>`, `http` devices post to
 * `POST /api/v2/telemetry/readings` with their API key (`X-API-Key`, scope `telemetry:ingest`).
 * `lastSeenAt` is updated at most once a minute.
 */
export type ConnectionState = 'online' | 'idle' | 'offline' | 'never' | 'inactive';

/**
 * Connection state of a device: the service's `connectionState` (telemetry 0.2: newest reading
 * against `activeWindowMin` / `offlineAfterMin`), derived from `lastSeenAt` with the same
 * default thresholds when a record does not carry it.
 */
export function connectionState(
  device: {
    status: string;
    lastSeenAt: string | null;
    connectionState?: ConnectionState | null;
    activeWindowMin?: number;
    offlineAfterMin?: number;
  },
  now = Date.now(),
): ConnectionState {
  if (device.connectionState) return device.connectionState;
  if (device.status !== 'active') return 'inactive';
  if (!device.lastSeenAt) return 'never';
  const age = now - Date.parse(device.lastSeenAt);
  if (age <= (device.activeWindowMin ?? 15) * 60_000) return 'online';
  if (age <= (device.offlineAfterMin ?? 24 * 60) * 60_000) return 'idle';
  return 'offline';
}

export function mqttTopicOf(device: { id: string; mqttTopic: string | null }): string {
  return device.mqttTopic ?? telemetryMqttTopic(device.id);
}

/** Example MQTT payload: one reading (or an array of up to 1000); the MMSI is the device's. */
export function mqttPayloadExample(now = new Date()): string {
  const time = new Date(Math.floor(now.getTime() / 600_000) * 600_000);
  const start = new Date(time.getTime() - 600_000);
  return JSON.stringify(
    {
      time: time.toISOString().replace('.000Z', 'Z'),
      periodStart: start.toISOString().replace('.000Z', 'Z'),
      fuelMeTon: 0.042,
      fuelAeTon: 0.006,
    },
    null,
    2,
  );
}

/** Example HTTP request of an `http` device (the key is the one shown once at creation). */
export function httpRequestExample(origin: string, mmsi: number, now = new Date()): string {
  const time = new Date(Math.floor(now.getTime() / 600_000) * 600_000)
    .toISOString()
    .replace('.000Z', 'Z');
  return [
    `curl -X POST ${origin}/api/v2/telemetry/readings \\`,
    `  -H "X-API-Key: sk_…" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '[{"mmsi":${mmsi},"time":"${time}","fuelMeTon":0.042,"fuelAeTon":0.006}]'`,
  ].join('\n');
}

/**
 * `mosquitto_pub` command publishing one reading on the device topic; with the connection
 * details of `GET /telemetry/devices/:id/connection` it names the broker, TLS and broker user.
 */
export function mqttCommandExample(
  topic: string,
  now = new Date(),
  broker?: { host: string; port: number; tls: boolean; username: string | null } | null,
): string {
  const payload = JSON.stringify(JSON.parse(mqttPayloadExample(now)));
  const target = broker
    ? [
        `-h ${broker.host} -p ${broker.port}`,
        ...(broker.tls ? ['--tls-use-os-certs'] : []),
        ...(broker.username ? [`-u "${broker.username}" -P "<password>"`] : []),
      ].join(' ') + ' '
    : '';
  return `mosquitto_pub ${target}-V mqttv311 -q 1 -t "${topic}" -m '${payload}'`;
}

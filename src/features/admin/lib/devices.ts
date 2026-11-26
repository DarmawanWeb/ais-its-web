import { telemetryMqttTopic } from '@darmawanweb/ais-its-contracts';

/**
 * Telemetry devices (services/telemetry/README.md): `mqtt` devices publish JSON readings to
 * their own MQTT topic `aisits/telemetry/<deviceId>`, `http` devices post to
 * `POST /api/v2/telemetry/readings` with their API key (`X-API-Key`, scope `telemetry:ingest`).
 * `lastSeenAt` is updated at most once a minute.
 */
export type ConnectionState = 'online' | 'idle' | 'offline' | 'never' | 'inactive';

const ONLINE_MS = 15 * 60_000;
const IDLE_MS = 24 * 60 * 60_000;

/** Connection state of a device from its status and last reading. */
export function connectionState(
  device: { status: string; lastSeenAt: string | null },
  now = Date.now(),
): ConnectionState {
  if (device.status !== 'active') return 'inactive';
  if (!device.lastSeenAt) return 'never';
  const age = now - Date.parse(device.lastSeenAt);
  if (age <= ONLINE_MS) return 'online';
  if (age <= IDLE_MS) return 'idle';
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

/** `mosquitto_pub` command publishing one reading on the device topic. */
export function mqttCommandExample(topic: string, now = new Date()): string {
  const payload = JSON.stringify(JSON.parse(mqttPayloadExample(now)));
  return `mosquitto_pub -q 1 -t "${topic}" -m '${payload}'`;
}

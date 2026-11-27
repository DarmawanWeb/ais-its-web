import type {
  DeviceDto,
  FuelSeriesPointDto,
  FuelSummaryDto,
  TelemetryStatusDto,
  TelemetryVesselDto,
} from '@/shared/api/generated/telemetry/model';
import { TEST_IDS } from '@/test/tokens';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const VESSELS: TelemetryVesselDto[] = [
  {
    mmsi: 525005223,
    vesselId: '0192f0c8-7d3a-7c2e-9a1b-000525005223',
    orgId: TEST_IDS.orgA,
    name: 'KM Bahari Nusantara',
    status: 'active',
    lastReadingAt: minutesAgo(4),
    active: true,
    devices: 1,
  },
  {
    mmsi: 525019002,
    vesselId: '0192f0c8-7d3a-7c2e-9a1b-000525019002',
    orgId: TEST_IDS.orgA,
    name: 'MT Selat Jaya',
    status: 'active',
    lastReadingAt: null,
    active: false,
    devices: 0,
  },
];

export const POINTS: FuelSeriesPointDto[] = Array.from({ length: 6 }, (_, index) => ({
  time: new Date(Date.UTC(2026, 10, 21, index)).toISOString(),
  fuelMeTon: 0.12 + index * 0.01,
  fuelAeTon: 0.02,
  totalFuelTon: 0.14 + index * 0.01,
  readings: 6,
  periodStart: null,
  source: null,
  deviceId: null,
}));

export const SUMMARY: FuelSummaryDto = {
  mmsi: 525005223,
  from: '2026-11-15T00:00:00.000Z',
  to: '2026-11-22T00:00:00.000Z',
  readings: 1008,
  fuelMeTon: 24.31,
  fuelAeTon: 3.42,
  totalFuelTon: 27.73,
  firstReadingAt: '2026-11-15T00:10:00.000Z',
  lastReadingAt: minutesAgo(4),
};

export const STATUS: TelemetryStatusDto = {
  mmsi: 525005223,
  active: true,
  lastReadingAt: minutesAgo(4),
  activeWindowMin: 10,
  lastReading: null,
};

export const DEVICE: DeviceDto = {
  id: '0192f0c8-7d3a-7c2e-9a1e-000000000001',
  orgId: TEST_IDS.orgA,
  mmsi: 525005223,
  vesselName: 'KM Bahari Nusantara',
  name: 'Flowmeter ME/AE KM Bahari Nusantara',
  kind: 'mqtt',
  apiKeyId: null,
  status: 'active',
  serialNumber: 'FM-05223',
  mqttTopic: 'aisits/telemetry/0192f0c8-7d3a-7c2e-9a1e-000000000001',
  lastSeenAt: minutesAgo(1),
  lastReadingAt: minutesAgo(1),
  connectionState: 'online',
  activeWindowMin: 10,
  offlineAfterMin: 1440,
  createdBy: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

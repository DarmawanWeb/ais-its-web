// Fleet service (spec §13.3): the vessel list (`VesselSummaryDto`, page-based) that the command
// palette searches. The vessels feature may override it with a richer mock.
import { pageOf, vesselId, VESSELS } from '../lib.mjs';

const TYPE_CODES = [...new Set(VESSELS.map(([, , typeCode]) => typeCode))].sort();

/** `VesselTypeSummaryDto` of a demo type code (stable id, readable name). */
export const vesselTypeOf = (code) => ({
  id: `0192f0c8-7d3a-7c2e-9a1c-${String(TYPE_CODES.indexOf(code) + 1).padStart(12, '0')}`,
  code,
  name: code.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase()),
  icon: null,
});

/** `VesselSummaryDto` of a demo vessel. */
export const vesselSummaryOf = ([mmsi, name, typeCode]) => ({
  view: 'summary',
  id: vesselId(mmsi),
  mmsi,
  imo: null,
  name,
  flag: String(mmsi).startsWith('525') ? 'ID' : null,
  type: vesselTypeOf(typeCode),
  status: 'active',
  photoUrl: null,
  updatedAt: '2026-11-01T00:00:00.000Z',
});

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/vessels',
    handler: ({ url, send }) => {
      const term = (url.searchParams.get('search') ?? '').toLowerCase();
      const typeCode = url.searchParams.get('typeCode');
      const status = url.searchParams.get('status');
      const vessels = VESSELS.filter(
        ([mmsi, name, type]) =>
          (!term || name.toLowerCase().includes(term) || String(mmsi).includes(term)) &&
          (!typeCode || type === typeCode) &&
          (!status || status === 'active'),
      ).map(vesselSummaryOf);
      send(200, pageOf(vessels, url));
    },
  },
];

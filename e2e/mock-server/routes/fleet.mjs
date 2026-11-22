// Fleet service (spec §13.3): vessel search of the command palette.
import { vesselId, VESSELS } from '../lib.mjs';

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/vessels',
    handler: ({ url, send }) => {
      const term = (url.searchParams.get('search') ?? '').toLowerCase();
      const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
      const data = VESSELS.filter(
        ([mmsi, name]) => !term || name.toLowerCase().includes(term) || String(mmsi).includes(term),
      )
        .slice(0, pageSize)
        .map(([mmsi, name, typeCode]) => ({
          view: 'summary',
          id: vesselId(mmsi),
          mmsi,
          imo: null,
          name,
          flag: 'ID',
          typeCode,
        }));
      send(200, { data, meta: { page: 1, pageSize, total: data.length } });
    },
  },
];

// Fleet service mock (spec §13.3, services/fleet/README.md) for the vessels feature: the vessel
// registry with tenancy (detail view for the own organization, summary for others), create /
// patch / delete, dimensions / engines / ports replacement, photos (multipart, kept in memory as
// data URLs), the ship registry lookup and the reference data the vessel form needs.
// Reference-data routes are RegExps so a richer module of the reference-data page (admin) with
// plain paths takes precedence over them (patterns rank before RegExps).
import { vesselTypeOf } from '../base/fleet.mjs';
import { FLEET_ORG_ID, MockHttpError, nowIso, pageOf, vesselId, VESSELS } from '../lib.mjs';

const AT = '2026-11-01T00:00:00.000Z';
/** A shipping company that is not a demo login's organization (identity-only vessels). */
export const FOREIGN_ORG_ID = '0192f0c8-7d3a-7c2e-9a1b-0000000000f1';
const FOREIGN = new Set([563012345, 563045678, 538007788, 636019900]);
const refId = (group, n) => `0192f0c8-7d3a-7c2e-9a2${group}-${String(n).padStart(12, '0')}`;

// --- reference data -------------------------------------------------------------------------

const CII_PARAMS = {
  tanker: ['DWT', 5247, 0.61, [0.82, 0.93, 1.08, 1.28]],
  ro_ro_passenger_ship: ['GT', 2023, 0.46, [0.72, 0.9, 1.12, 1.41]],
  general_cargo_ship: ['DWT', 31948, 0.792, [0.83, 0.94, 1.06, 1.19]],
  container_ship: ['DWT', 1984, 0.489, [0.83, 0.94, 1.07, 1.19]],
  refrigerated_cargo_carrier: ['DWT', 4600, 0.557, [0.78, 0.91, 1.07, 1.2]],
  bulk_carrier: ['DWT', 4745, 0.622, [0.86, 0.94, 1.06, 1.18]],
  lng_carrier: ['DWT', 144050e10, 2.071, [0.89, 0.98, 1.06, 1.13]],
  ro_ro_cargo_ship_vc: ['GT', 5739, 0.631, [0.86, 0.94, 1.06, 1.16]],
  gas_carrier: ['DWT', 8104, 0.639, [0.81, 0.91, 1.12, 1.44]],
  cruise_passenger_ship: ['GT', 930, 0.383, [0.87, 0.95, 1.06, 1.16]],
  combination_carrier: ['DWT', 40853, 0.812, [0.87, 0.96, 1.06, 1.14]],
  unknown: ['GT', 31948, 0.792, [0.83, 0.94, 1.06, 1.19]],
};

const ICONS = {
  tanker: 'tanker',
  ro_ro_passenger_ship: 'ro-rop',
  general_cargo_ship: 'genera',
  container_ship: 'contai',
  refrigerated_cargo_carrier: 'refrig',
  bulk_carrier: 'bulkca',
  lng_carrier: 'lngcar',
  ro_ro_cargo_ship_vc: 'ro-rov',
  gas_carrier: 'gascar',
  cruise_passenger_ship: 'cruise',
  combination_carrier: 'combin',
  unknown: 'unknown',
};

/** `VesselTypeDto` (ids and names of the base mock, CII line and rating vector of MEPC.353/354). */
const vesselTypeDtoOf = (code) => {
  const [capacityUnit, a, c, [d1, d2, d3, d4]] = CII_PARAMS[code] ?? CII_PARAMS.unknown;
  return {
    ...vesselTypeOf(code),
    icon: ICONS[code] ?? 'unknown',
    capacityUnit,
    a,
    c,
    capacityFixed: null,
    d: { d1, d2, d3, d4 },
    source: 'IMO MEPC.353(78), MEPC.354(78)',
    createdAt: AT,
    updatedAt: AT,
  };
};

export const VESSEL_TYPES = Object.keys(CII_PARAMS).map(vesselTypeDtoOf);

const FUELS = [
  ['diesel_gas_oil', 'Diesel / gas oil', 0.8744, 3.206, 0.86],
  ['hfo', 'Heavy fuel oil (HFO)', 0.8493, 3.114, 0.98],
  ['lfo', 'Light fuel oil (LFO)', 0.8594, 3.151, 0.94],
  ['lng', 'Liquefied natural gas (LNG)', 0.75, 2.75, 0.45],
].map(([code, name, carbonContent, conversionFactor, density], index) => ({
  id: refId(1, index + 1),
  code,
  name,
  carbonContent,
  conversionFactor,
  density,
  source: 'IMO MEPC.364(79)',
  createdAt: AT,
  updatedAt: AT,
}));

const ENGINES = [
  ['niigata_6m28bet', 'main', 'NIIGATA 6M28BET', 390, 2100, 179.2],
  ['man_bw_6s50me', 'main', 'MAN B&W 6S50ME-C', 127, 9960, 167],
  ['wartsila_8l32', 'main', 'Wärtsilä 8L32', 750, 4640, 178],
  ['man_d2866le', 'auxiliary', 'MAN D2866LE', 1800, 276, 207],
  ['cummins_kta19', 'auxiliary', 'Cummins KTA19-D(M)', 1800, 448, 211],
  ['yanmar_6ey18', 'auxiliary', 'Yanmar 6EY18ALW', 900, 600, 198],
].map(([code, kind, name, rpm, powerKw, sfoc], index) => ({
  id: refId(2, index + 1),
  code,
  kind,
  name,
  rpm,
  powerKw,
  sfoc,
  source: null,
  createdAt: AT,
  updatedAt: AT,
}));

const INITIAL_FORMULAS = [
  {
    id: refId(3, 1),
    code: 'dharma_ferry_viii',
    name: 'Dharma Ferry VIII',
    mainEngineFormula: '-0.0382 * speedKnot ** 2 + 0.8658 * speedKnot - 0.0197',
    auxiliaryEngineFormula: '1.5103 * Math.exp(-0.064 * speedKnot)',
    source: 'thesis — needs citation',
    createdAt: AT,
    updatedAt: AT,
  },
];

const PORTS = [
  ['IDBTH', 'Batu Ampar', 'Kota Batam, Kepulauan Riau', 104.006, 1.163],
  ['IDSKP', 'Sekupang', 'Kota Batam, Kepulauan Riau', 103.94, 1.115],
  ['IDTPP', 'Tanjung Priok', 'Jakarta Utara, DKI Jakarta', 106.885, -6.104],
  ['IDPDB', 'Padang Bai', 'Karangasem, Bali', 115.51, -8.53],
  ['IDLEM', 'Lembar', 'Lombok Barat, NTB', 116.07, -8.73],
  ['SGPSP', 'Pasir Panjang', 'Singapore', 103.765, 1.272],
].map(([code, name, administrativeLocation, lon, lat], index) => ({
  id: refId(4, index + 1),
  name,
  code,
  administrativeLocation,
  location: { type: 'Point', coordinates: [lon, lat] },
  radiusM: 1500,
  source: null,
  createdAt: AT,
  updatedAt: AT,
}));

const REGISTRY = [
  [
    525019100,
    '9123456',
    'KM SEGARA BIRU',
    2004,
    'ID',
    'Indonesia',
    'TNK',
    'Oil Tanker',
    4200,
    6100,
    98.5,
    17.2,
    6.3,
  ],
  [
    525019101,
    '9234567',
    'KM SEGARA HIJAU',
    2008,
    'ID',
    'Indonesia',
    'GCG',
    'General Cargo',
    3100,
    4500,
    88.0,
    15.0,
    5.6,
  ],
  [
    525019102,
    '9345678',
    'KMP BAHARI JAYA',
    2012,
    'ID',
    'Indonesia',
    'PRR',
    'Ro-Ro Passenger Ship',
    2650,
    820,
    71.4,
    15.4,
    3.9,
  ],
  [
    563099001,
    '9456789',
    'STRAITS PIONEER',
    2015,
    'SG',
    'Singapore',
    'UCC',
    'Container Ship',
    9940,
    12400,
    146.0,
    23.2,
    8.2,
  ],
  [
    525005223,
    '9037941',
    'BAHARI NUSANTARA',
    1990,
    'ID',
    'Indonesia',
    'TNK',
    'Oil Tanker',
    2877,
    3500,
    73.3,
    16.3,
    4.1,
  ],
  [
    525019103,
    '9567890',
    'KM SAMUDRA RAYA',
    1998,
    'ID',
    'Indonesia',
    'BBU',
    'Bulk Carrier',
    14200,
    23500,
    154.0,
    25.0,
    9.5,
  ],
].map(
  (
    [mmsi, imo, name, built, flag, flagName, type, typeName, gt, dwt, loaM, beamM, draughtM],
    index,
  ) => ({
    id: refId(5, index + 1),
    imo,
    mmsi,
    name,
    built,
    flag,
    flagName,
    type,
    typeName,
    gt,
    dwt,
    loaM,
    beamM,
    draughtM,
    class: 'Biro Klasifikasi Indonesia',
    classCode: 'BKI',
    updatedAt: AT,
  }),
);

// --- photos ---------------------------------------------------------------------------------

/** A stylised vessel picture (SVG data URL) so lists and screenshots look like real photos. */
function illustration(seed, tint) {
  const hues = [
    [199, 210],
    [205, 190],
    [215, 200],
    [190, 175],
    [222, 205],
  ][seed % 5];
  const [sky, sea] = hues;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${sky},70%,78%)"/><stop offset="1" stop-color="hsl(${sky},60%,92%)"/></linearGradient><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${sea},65%,38%)"/><stop offset="1" stop-color="hsl(${sea},70%,22%)"/></linearGradient></defs><rect width="320" height="200" fill="url(#s)"/><circle cx="${250 - (seed % 4) * 40}" cy="46" r="18" fill="hsl(45,95%,85%)" opacity=".9"/><rect y="128" width="320" height="72" fill="url(#w)"/><path d="M40 128 L280 128 L262 150 L58 150 Z" fill="${tint}"/><rect x="${92 + (seed % 3) * 10}" y="98" width="${70 + (seed % 2) * 22}" height="30" rx="3" fill="#f8fafc"/><rect x="${176 + (seed % 3) * 8}" y="84" width="34" height="44" rx="3" fill="#e2e8f0"/><rect x="${186 + (seed % 3) * 8}" y="70" width="8" height="16" fill="#334155"/><g fill="#0f172a" opacity=".55"><rect x="${100 + (seed % 3) * 10}" y="106" width="9" height="7"/><rect x="${116 + (seed % 3) * 10}" y="106" width="9" height="7"/><rect x="${132 + (seed % 3) * 10}" y="106" width="9" height="7"/></g><path d="M0 160 Q40 154 80 160 T160 160 T240 160 T320 160 V200 H0 Z" fill="#ffffff" opacity=".08"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const HULLS = ['#b91c1c', '#1e3a8a', '#0f766e', '#7c2d12', '#334155', '#9a3412'];

// --- vessels --------------------------------------------------------------------------------

function initialVessels() {
  return VESSELS.map(([mmsi, name, typeCode, , , , sog], index) => {
    const type = VESSEL_TYPES.find((t) => t.code === typeCode) ?? VESSEL_TYPES.at(-1);
    const loa = 60 + ((mmsi % 97) / 97) * 140;
    const b = loa / 6.2;
    const t = b / 3.1;
    const gt = Math.round(loa * b * t * 0.62);
    const main = ENGINES[index % 3];
    const aux = ENGINES[3 + (index % 3)];
    return {
      id: vesselId(mmsi),
      orgId: FOREIGN.has(mmsi) ? FOREIGN_ORG_ID : FLEET_ORG_ID,
      mmsi,
      imo: String(9_000_000 + ((mmsi * 7) % 999_999)).padStart(7, '9'),
      name,
      flag: String(mmsi).startsWith('525')
        ? 'ID'
        : String(mmsi).startsWith('563')
          ? 'SG'
          : String(mmsi).startsWith('538')
            ? 'MH'
            : 'LR',
      typeId: type.id,
      status: index === 6 ? 'laid_up' : index === 11 ? 'inactive' : 'active',
      photoUrl: index % 4 === 3 ? null : illustration(index, HULLS[index % HULLS.length]),
      builtYear: 1990 + ((index * 3) % 32),
      annualVoyagePercentage: 45 + ((index * 7) % 40),
      dimensions: {
        capacity: type.capacityUnit === 'GT' ? gt : Math.round(gt * 1.4),
        dwt: Math.round(gt * 1.4),
        gt,
        cb: 0.64,
        lwl: Math.round(loa * 0.95 * 100) / 100,
        b: Math.round(b * 100) / 100,
        t: Math.round(t * 100) / 100,
        cwp: 0.75,
        loa: Math.round(loa * 100) / 100,
        lpp: Math.round(loa * 0.91 * 100) / 100,
        cp: 0.67,
        cm: 0.98,
        cbnsp: 0.66,
        bulbousBow: index % 2 === 0,
        cstern: 8,
        c1: 1,
        c2: 1,
        c3: 1,
        c5: 1.5,
        vs: Math.max(10, Math.round(sog + 2)),
      },
      fuelId: FUELS[index % 3 === 2 ? 1 : 0].id,
      firstFuelFormulaId: index === 0 ? INITIAL_FORMULAS[0].id : null,
      engines: [
        { engineId: main.id, role: 'main', quantity: 1 },
        { engineId: aux.id, role: 'auxiliary', quantity: 2 },
      ],
      portIds: [PORTS[0].id, PORTS[1].id, ...(index % 2 ? [PORTS[2].id] : [])],
      legacyId: null,
      createdAt: AT,
      updatedAt: AT,
    };
  });
}

let vessels = initialVessels();
let formulas = structuredClone(INITIAL_FORMULAS);

export function reset() {
  vessels = initialVessels();
  formulas = structuredClone(INITIAL_FORMULAS);
}

/** Vessels of an organization (other mock modules: telemetry vessels, devices). */
export function vesselsOfOrg(orgId) {
  return vessels.filter((vessel) => vessel.orgId === orgId);
}

/** The stored record of an MMSI (any organization), or undefined. */
export function vesselRecord(mmsi) {
  return vessels.find((vessel) => vessel.mmsi === Number(mmsi));
}

const isAdmin = (claims) => (claims?.roles ?? []).includes('super_admin');
const canSee = (claims, vessel) =>
  isAdmin(claims) || (vessel.orgId !== null && vessel.orgId === claims?.org);

function summaryOf(vessel) {
  const type = VESSEL_TYPES.find((t) => t.id === vessel.typeId) ?? VESSEL_TYPES[0];
  return {
    view: 'summary',
    id: vessel.id,
    mmsi: vessel.mmsi,
    imo: vessel.imo,
    name: vessel.name,
    flag: vessel.flag,
    type: { id: type.id, code: type.code, name: type.name, icon: type.icon },
    status: vessel.status,
    photoUrl: vessel.photoUrl,
    updatedAt: vessel.updatedAt,
  };
}

function detailOf(vessel) {
  const type = VESSEL_TYPES.find((t) => t.id === vessel.typeId) ?? VESSEL_TYPES[0];
  const fuel = FUELS.find((f) => f.id === vessel.fuelId) ?? FUELS[0];
  const engines = [...vessel.engines]
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'main' ? -1 : 1))
    .map((row) => ({
      role: row.role,
      quantity: row.quantity,
      engine: ENGINES.find((engine) => engine.id === row.engineId),
    }))
    .filter((row) => row.engine);
  return {
    ...summaryOf(vessel),
    view: 'detail',
    type,
    orgId: vessel.orgId,
    builtYear: vessel.builtYear,
    annualVoyagePercentage: vessel.annualVoyagePercentage,
    dimensions: vessel.dimensions,
    fuel,
    firstFuelFormula: formulas.find((f) => f.id === vessel.firstFuelFormulaId) ?? null,
    engines,
    ports: vessel.portIds
      .map((id) => PORTS.find((port) => port.id === id))
      .filter(Boolean)
      .map(({ id, code, name }) => ({ id, code, name })),
    legacyId: vessel.legacyId,
    createdAt: vessel.createdAt,
  };
}

const viewOf = (claims, vessel) => (canSee(claims, vessel) ? detailOf(vessel) : summaryOf(vessel));

function invalid(errors) {
  return new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', { errors });
}

function findById(id) {
  const vessel = vessels.find((v) => v.id === id);
  if (!vessel)
    throw new MockHttpError(404, 'VESSEL_NOT_FOUND', 'Vessel not found', {
      detail: `No vessel ${id}`,
    });
  return vessel;
}

/** The vessel of a write: exists and belongs to the caller's organization (or super_admin). */
function writable(claims, id) {
  const vessel = findById(id);
  if (!canSee(claims, vessel)) throw new MockHttpError(403, 'FORBIDDEN', 'Forbidden');
  return vessel;
}

const DIMENSION_BOUNDS = {
  capacity: [0, Infinity, true],
  cb: [0, 1.5],
  lwl: [0, 600],
  b: [0, 100],
  t: [0, 40],
  cwp: [0, 1.5],
  loa: [0, 600],
  lpp: [0, 600],
  cp: [0, 1.5],
  cm: [0, 1.5],
  cbnsp: [0, 1.5],
  cstern: [-100, 100],
  c1: [-Infinity, Infinity],
  c2: [-Infinity, Infinity],
  c3: [-Infinity, Infinity],
  c5: [-Infinity, Infinity],
  vs: [0, 60],
};

function dimensionErrors(dimensions, prefix) {
  const errors = [];
  if (!dimensions || typeof dimensions !== 'object')
    return [{ field: prefix || 'dimensions', message: 'dimensions must be an object' }];
  for (const [key, [min, max, exclusive]] of Object.entries(DIMENSION_BOUNDS)) {
    const value = dimensions[key];
    const field = prefix ? `${prefix}.${key}` : key;
    if (typeof value !== 'number' || !Number.isFinite(value))
      errors.push({ field, message: `${key} must be a number` });
    else if (exclusive ? value <= min : value < min)
      errors.push({ field, message: `${key} must not be less than ${min}` });
    else if (value > max) errors.push({ field, message: `${key} must not be greater than ${max}` });
  }
  if (typeof dimensions.bulbousBow !== 'boolean')
    errors.push({
      field: prefix ? `${prefix}.bulbousBow` : 'bulbousBow',
      message: 'bulbousBow must be a boolean',
    });
  return errors;
}

function engineErrors(rows, prefix) {
  const errors = [];
  if (!Array.isArray(rows))
    return [{ field: prefix || 'engines', message: 'engines must be an array' }];
  if (rows.length > 16)
    errors.push({ field: prefix || 'engines', message: 'at most 16 engine rows' });
  let mains = 0;
  rows.forEach((row, index) => {
    const field = (leaf) => (prefix ? `${prefix}.${index}.${leaf}` : `${index}.${leaf}`);
    const engine = ENGINES.find((e) => e.id === row?.engineId);
    if (!engine) errors.push({ field: field('engineId'), message: 'unknown engine' });
    else if (engine.kind !== row.role)
      errors.push({ field: field('role'), message: `role must be ${engine.kind}` });
    if (!Number.isInteger(row?.quantity) || row.quantity < 1 || row.quantity > 64)
      errors.push({ field: field('quantity'), message: 'quantity must be 1–64' });
    if (row?.role === 'main') mains += 1;
  });
  if (mains > 1)
    errors.push({ field: prefix || 'engines', message: 'At most one main-engine row' });
  return errors;
}

function identityErrors(body, partial) {
  const errors = [];
  const has = (key) => Object.hasOwn(body, key);
  if (
    (!partial || has('mmsi')) &&
    !(Number.isInteger(body.mmsi) && body.mmsi >= 100_000_000 && body.mmsi <= 999_999_999)
  ) {
    errors.push({ field: 'mmsi', message: 'mmsi must be a 9-digit MMSI' });
  }
  if (
    (!partial || has('name')) &&
    !(typeof body.name === 'string' && body.name.trim().length >= 1 && body.name.length <= 120)
  ) {
    errors.push({ field: 'name', message: 'name must be 1–120 characters' });
  }
  if (has('imo') && body.imo !== null && !/^\d{7}$/.test(String(body.imo)))
    errors.push({ field: 'imo', message: 'imo must match /^\\d{7}$/' });
  if (has('flag') && body.flag !== null && !/^[A-Z]{2}$/.test(String(body.flag)))
    errors.push({ field: 'flag', message: 'flag must match /^[A-Z]{2}$/' });
  if (
    has('builtYear') &&
    body.builtYear !== null &&
    !(Number.isInteger(body.builtYear) && body.builtYear >= 1800 && body.builtYear <= 2200)
  ) {
    errors.push({ field: 'builtYear', message: 'builtYear must be 1800–2200' });
  }
  if (
    (!partial || has('annualVoyagePercentage')) &&
    !(
      typeof body.annualVoyagePercentage === 'number' &&
      body.annualVoyagePercentage >= 0 &&
      body.annualVoyagePercentage <= 100
    )
  ) {
    errors.push({
      field: 'annualVoyagePercentage',
      message: 'annualVoyagePercentage must be 0–100',
    });
  }
  if ((!partial || has('typeId')) && !VESSEL_TYPES.some((t) => t.id === body.typeId))
    errors.push({ field: 'typeId', message: 'unknown vessel type' });
  if ((!partial || has('fuelId')) && !FUELS.some((f) => f.id === body.fuelId))
    errors.push({ field: 'fuelId', message: 'unknown fuel' });
  if (
    has('firstFuelFormulaId') &&
    body.firstFuelFormulaId !== null &&
    !formulas.some((f) => f.id === body.firstFuelFormulaId)
  ) {
    errors.push({ field: 'firstFuelFormulaId', message: 'unknown fuel formula' });
  }
  if (has('status') && !['active', 'inactive', 'laid_up'].includes(body.status))
    errors.push({ field: 'status', message: 'invalid status' });
  return errors;
}

function assertUnique(body, self) {
  if (body.mmsi !== undefined && vessels.some((v) => v.mmsi === body.mmsi && v.id !== self)) {
    throw new MockHttpError(409, 'MMSI_ALREADY_EXISTS', 'MMSI already exists', {
      detail: `MMSI ${body.mmsi} is registered`,
    });
  }
  if (body.imo && vessels.some((v) => v.imo === body.imo && v.id !== self)) {
    throw new MockHttpError(409, 'IMO_ALREADY_EXISTS', 'IMO already exists', {
      detail: `IMO ${body.imo} is registered`,
    });
  }
}

const touch = (vessel) => {
  vessel.updatedAt = nowIso();
  return vessel;
};

/** Minimal multipart/form-data reader: the bytes and content type of the `file` part. */
async function readMultipartFile(req) {
  const type = req.headers['content-type'] ?? '';
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type);
  if (!type.startsWith('multipart/form-data') || !boundary) {
    throw new MockHttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024 + 64 * 1024) {
      throw new MockHttpError(413, 'PAYLOAD_TOO_LARGE', 'Payload too large', {
        detail: 'Photos are limited to 5 MB',
      });
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  const marker = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  let start = body.indexOf(marker);
  while (start !== -1) {
    const next = body.indexOf(marker, start + marker.length);
    if (next === -1) break;
    const part = body.subarray(start + marker.length + 2, next - 2);
    const headerEnd = part.indexOf('\r\n\r\n');
    const headers = part.subarray(0, headerEnd).toString();
    if (/name="file"/.test(headers)) return part.subarray(headerEnd + 4);
    start = next;
  }
  throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
    errors: [{ field: 'file', message: 'file is required' }],
  });
}

/** Content type by magic bytes, like the service (JPEG, PNG, WebP). */
function sniff(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  return null;
}

function registrySearch(q) {
  const term = q
    .trim()
    .toLowerCase()
    .replace(/^imo\s*/, '');
  if (/^\d+$/.test(term)) {
    return REGISTRY.filter(
      (entry) => String(entry.mmsi).startsWith(term) || (entry.imo ?? '').startsWith(term),
    );
  }
  return REGISTRY.filter(
    (entry) =>
      entry.name.toLowerCase().startsWith(term) ||
      (term.length >= 3 && entry.name.toLowerCase().includes(term)),
  );
}

const list =
  (items) =>
  ({ url, send }) => {
    const term = (url.searchParams.get('search') ?? '').toLowerCase();
    send(
      200,
      pageOf(
        items().filter(
          (item) => !term || `${item.name} ${item.code ?? ''}`.toLowerCase().includes(term),
        ),
        url,
      ),
    );
  };

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/vessels',
    permission: 'vessel:read',
    handler: ({ url, claims, send }) => {
      const term = (url.searchParams.get('search') ?? '').trim().toLowerCase();
      const typeCode = url.searchParams.get('typeCode');
      const status = url.searchParams.get('status');
      const orgId = url.searchParams.get('orgId');
      if (orgId && !isAdmin(claims) && orgId !== claims?.org)
        throw new MockHttpError(403, 'FORBIDDEN', 'Forbidden');
      const items = vessels
        .filter((vessel) => {
          const type = VESSEL_TYPES.find((t) => t.id === vessel.typeId);
          const digits = /^\d+$/.test(term);
          return (
            (!term ||
              vessel.name.toLowerCase().includes(term) ||
              (digits &&
                (String(vessel.mmsi).startsWith(term) || (vessel.imo ?? '').startsWith(term)))) &&
            (!typeCode || type?.code === typeCode) &&
            (!status || vessel.status === status) &&
            (!orgId || vessel.orgId === orgId)
          );
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((vessel) => viewOf(claims, vessel));
      send(200, pageOf(items, url));
    },
  },
  {
    method: 'POST',
    path: '/api/v2/vessels',
    permission: 'vessel:write',
    handler: async ({ claims, body, send }) => {
      const input = await body();
      if (!claims?.org && !isAdmin(claims))
        throw new MockHttpError(403, 'ORGANIZATION_REQUIRED', 'Organization required');
      const errors = [
        ...identityErrors(input, false),
        ...dimensionErrors(input.dimensions, 'dimensions'),
        ...(input.engines ? engineErrors(input.engines, 'engines') : []),
      ];
      if (errors.length) throw invalid(errors);
      assertUnique(input, null);
      const vessel = {
        id: vesselId(input.mmsi),
        orgId: claims?.org ?? null,
        mmsi: input.mmsi,
        imo: input.imo ?? null,
        name: input.name.trim(),
        flag: input.flag ?? null,
        typeId: input.typeId,
        status: input.status ?? 'active',
        photoUrl: null,
        builtYear: input.builtYear ?? null,
        annualVoyagePercentage: input.annualVoyagePercentage,
        dimensions: { dwt: null, gt: null, ...input.dimensions },
        fuelId: input.fuelId,
        firstFuelFormulaId: input.firstFuelFormulaId ?? null,
        engines: input.engines ?? [],
        portIds: input.portIds ?? [],
        legacyId: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      vessels.push(vessel);
      send(201, detailOf(vessel));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/vessels/by-mmsi/:mmsi',
    permission: 'vessel:read',
    handler: ({ params, claims, send }) => {
      if (!/^\d{9}$/.test(params.mmsi))
        throw invalid([{ field: 'mmsi', message: 'mmsi must be 9 digits' }]);
      const vessel = vesselRecord(params.mmsi);
      if (!vessel)
        throw new MockHttpError(404, 'VESSEL_NOT_FOUND', 'Vessel not found', {
          detail: `No vessel with MMSI ${params.mmsi}`,
        });
      send(200, viewOf(claims, vessel));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/vessels/:id',
    permission: 'vessel:read',
    handler: ({ params, claims, send }) => send(200, viewOf(claims, findById(params.id))),
  },
  {
    method: 'PATCH',
    path: '/api/v2/vessels/:id',
    permission: 'vessel:write',
    handler: async ({ params, claims, body, send }) => {
      const vessel = writable(claims, params.id);
      const input = await body();
      const errors = identityErrors(input, true);
      if (errors.length) throw invalid(errors);
      assertUnique(input, vessel.id);
      for (const key of [
        'mmsi',
        'imo',
        'name',
        'flag',
        'builtYear',
        'status',
        'annualVoyagePercentage',
        'typeId',
        'fuelId',
        'firstFuelFormulaId',
      ]) {
        if (Object.hasOwn(input, key))
          vessel[key] = key === 'name' ? input.name.trim() : input[key];
      }
      send(200, detailOf(touch(vessel)));
    },
  },
  {
    method: 'DELETE',
    path: '/api/v2/vessels/:id',
    permission: 'vessel:write',
    handler: ({ params, claims, send }) => {
      const vessel = writable(claims, params.id);
      vessels = vessels.filter((v) => v.id !== vessel.id);
      send(204);
    },
  },
  {
    method: 'PUT',
    path: '/api/v2/vessels/:id/dimensions',
    permission: 'vessel:write',
    handler: async ({ params, claims, body, send }) => {
      const vessel = writable(claims, params.id);
      const input = await body();
      const errors = dimensionErrors(input, '');
      if (errors.length) throw invalid(errors);
      vessel.dimensions = { dwt: null, gt: null, ...input };
      send(200, detailOf(touch(vessel)));
    },
  },
  {
    method: 'PUT',
    path: '/api/v2/vessels/:id/engines',
    permission: 'vessel:write',
    handler: async ({ params, claims, body, send }) => {
      const vessel = writable(claims, params.id);
      const input = await body();
      const errors = engineErrors(input, '');
      if (errors.length) throw invalid(errors);
      vessel.engines = input;
      send(200, detailOf(touch(vessel)));
    },
  },
  {
    method: 'PUT',
    path: '/api/v2/vessels/:id/ports',
    permission: 'vessel:write',
    handler: async ({ params, claims, body, send }) => {
      const vessel = writable(claims, params.id);
      const input = await body();
      if (!Array.isArray(input) || input.length > 50 || new Set(input).size !== input.length) {
        throw invalid([{ field: '(body)', message: 'ports must be ≤ 50 unique ids' }]);
      }
      const unknown = input.findIndex((id) => !PORTS.some((port) => port.id === id));
      if (unknown !== -1) throw invalid([{ field: String(unknown), message: 'unknown port' }]);
      vessel.portIds = input;
      send(200, detailOf(touch(vessel)));
    },
  },
  {
    method: 'POST',
    path: '/api/v2/vessels/:id/photo',
    permission: 'vessel:write',
    handler: async ({ req, params, claims, send }) => {
      const vessel = writable(claims, params.id);
      const bytes = await readMultipartFile(req);
      if (bytes.length > 5 * 1024 * 1024)
        throw new MockHttpError(413, 'PAYLOAD_TOO_LARGE', 'Payload too large');
      const type = sniff(bytes);
      if (!type)
        throw new MockHttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type', {
          detail: 'JPEG, PNG or WebP only',
        });
      vessel.photoUrl = `data:${type};base64,${bytes.toString('base64')}`;
      send(201, detailOf(touch(vessel)));
    },
  },
  {
    method: 'DELETE',
    path: '/api/v2/vessels/:id/photo',
    permission: 'vessel:write',
    handler: ({ params, claims, send }) => {
      const vessel = writable(claims, params.id);
      if (!vessel.photoUrl) throw new MockHttpError(404, 'PHOTO_NOT_FOUND', 'Photo not found');
      vessel.photoUrl = null;
      touch(vessel);
      send(204);
    },
  },
  {
    method: 'GET',
    path: '/api/v2/registry/search',
    permission: 'vessel:read',
    handler: ({ url, send }) => {
      const q = url.searchParams.get('q') ?? '';
      if (!q.trim() || q.length > 100)
        throw invalid([{ field: 'q', message: 'q must be 1–100 characters' }]);
      send(200, pageOf(registrySearch(q), url));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/registry/:key',
    permission: 'vessel:read',
    handler: ({ params, send }) => {
      const key = params.key.replace(/^IMO/i, '');
      if (!/^\d{7}$|^\d{9}$/.test(key))
        throw invalid([{ field: 'imoOrMmsi', message: '7-digit IMO or 9-digit MMSI' }]);
      const entry = REGISTRY.find((item) =>
        key.length === 9 ? String(item.mmsi) === key : item.imo === key,
      );
      if (!entry)
        throw new MockHttpError(404, 'REGISTRY_ENTRY_NOT_FOUND', 'Registry entry not found');
      send(200, entry);
    },
  },
  // Reference data (fallbacks; see the header comment).
  {
    method: 'GET',
    path: /^\/api\/v2\/vessel-types\/?$/,
    permission: 'vessel:read',
    handler: list(() => VESSEL_TYPES),
  },
  {
    method: 'GET',
    path: /^\/api\/v2\/fuels\/?$/,
    permission: 'vessel:read',
    handler: list(() => FUELS),
  },
  {
    method: 'GET',
    path: /^\/api\/v2\/engines\/?$/,
    permission: 'vessel:read',
    handler: ({ url, send }) => {
      const kind = url.searchParams.get('kind');
      send(
        200,
        pageOf(
          ENGINES.filter((engine) => !kind || engine.kind === kind),
          url,
        ),
      );
    },
  },
  {
    method: 'GET',
    path: /^\/api\/v2\/fuel-formulas\/?$/,
    permission: 'vessel:read',
    handler: list(() => formulas),
  },
  {
    method: 'POST',
    path: /^\/api\/v2\/fuel-formulas\/?$/,
    permission: 'reference:write',
    handler: async ({ body, send }) => {
      const input = await body();
      if (!input.name?.trim()) throw invalid([{ field: 'name', message: 'name is required' }]);
      const formula = {
        id: refId(3, formulas.length + 1),
        code: input.code ?? null,
        name: input.name.trim(),
        mainEngineFormula: input.mainEngineFormula,
        auxiliaryEngineFormula: input.auxiliaryEngineFormula,
        source: input.source ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      formulas.push(formula);
      send(201, formula);
    },
  },
  {
    method: 'GET',
    path: /^\/api\/v2\/ports\/?$/,
    permission: 'vessel:read',
    handler: list(() => PORTS),
  },
];

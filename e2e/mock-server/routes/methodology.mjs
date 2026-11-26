// Emission service methodology endpoint (spec §17, services/emission/README.md "Methodology"):
// `GET /api/v2/emission/methodology` for every signed-in user. Lists methods the service runs
// with `catalogued` (whether the shipped contracts catalog describes them), the active reduction
// factors Z and the reference-line parameters of the vessel types.

/**
 * Methods of the service. Emission 0.2 runs only methods of the contracts 0.4 catalog, so every
 * entry is `catalogued: true` (the page shows the catalog's entry); a method the installed
 * catalog lacks would be `catalogued: false` and is merged in (covered by the unit tests).
 */
const SERVICE_METHODS = [
  {
    id: 'cii.year_end_projection',
    catalogued: true,
    domain: 'emission',
    name: {
      id: 'Proyeksi CII akhir tahun (linear)',
      en: 'Year-end CII projection (linear)',
    },
    status: 'implemented',
    needsCitation: true,
    references: [
      {
        id: 'imo-mepc-352-78',
        title:
          '2022 Guidelines on operational carbon intensity indicators and the calculation methods (CII Guidelines, G1)',
        url: 'https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MEPCDocuments/MEPC.352(78).pdf',
      },
      {
        id: 'platform-spec-v1-1',
        title: 'AIS Maritime Intelligence v2 - Engineering Specification, version 1.1',
        url: null,
      },
    ],
    summary: {
      id: 'Total sejak awal tahun (jarak, bahan bakar, CO2) dari tahun berjalan diproyeksikan linear ke 31 Desember, X_tahun = X_YTD / f dengan f fraksi tahun kalender yang telah lewat pada segmen terakhir, lalu CII tercapai proyeksi = CO2_tahun x 10^6 / (Kapasitas x D_tahun) dinilai. CO2 dan jarak berskala sama, sehingga CII tercapai, rating dan grade proyeksi sama dengan nilai sejak awal tahun; tren CII kumulatif harian sengaja tidak diekstrapolasi.',
      en: 'Projects the year-to-date totals (distance, fuel, CO2) of a year in progress linearly to 31 December, X_year = X_YTD / f with f the elapsed fraction of the calendar year at the last segment, and rates the projected attained CII = CO2_year x 10^6 / (Capacity x D_year). CO2 and distance scale alike, so the projected attained CII, rating and grade equal the year-to-date values; the trend of the daily cumulative CII is deliberately not extrapolated.',
    },
    formulaLatex:
      'X_{year}=\\frac{X_{YTD}}{f},\\quad f=\\frac{t_{last}-t_{1\\,Jan}}{t_{1\\,Jan+1}-t_{1\\,Jan}}\\in(0,1],\\qquad CII_{year}=\\frac{CO2_{year}\\cdot10^{6}}{Cap\\cdot D_{year}}=CII_{YTD}',
    variables: [
      {
        symbol: 'X_{YTD}',
        name: {
          id: 'Total sejak awal tahun: jarak, bahan bakar, CO2',
          en: 'Year-to-date totals: distance, fuel, CO2',
        },
        unit: 'nm, t',
      },
      {
        symbol: 'f',
        name: {
          id: 'Fraksi tahun kalender yang telah lewat pada segmen terakhir',
          en: 'Elapsed fraction of the calendar year at the last segment',
        },
        unit: null,
      },
      {
        symbol: 'Cap',
        name: {
          id: 'Kapasitas CII (DWT atau GT)',
          en: 'CII capacity (DWT or GT)',
        },
        unit: 't',
      },
      {
        symbol: 'D_{year}',
        name: {
          id: 'Jarak proyeksi setahun',
          en: 'Projected annual distance',
        },
        unit: 'nm',
      },
    ],
    constants: [],
    referenceIds: ['imo-mepc-352-78', 'platform-spec-v1-1'],
  },
  {
    id: 'seemp.simulation_combination',
    catalogued: true,
    domain: 'seemp',
    name: {
      id: 'Kombinasi langkah SEEMP (simulasi bagaimana-jika)',
      en: 'SEEMP measure combination (what-if simulation)',
    },
    status: 'implemented',
    needsCitation: true,
    references: [
      {
        id: 'platform-spec-v1-1',
        title: 'AIS Maritime Intelligence v2 - Engineering Specification, version 1.1',
        url: null,
      },
    ],
    summary: {
      id: 'Langkah SEEMP terpilih digabung secara berurutan dan multiplikatif, dan untuk satu langkah sama dengan rumus legacy: sisi bahan bakar dahulu (penggantian bahan bakar mengganti C_F, paling banyak satu per simulasi; setiap langkah energi bantu mengalikan sisa bahan bakar AE), lalu CII tercapai dihitung ulang dari sisi bahan bakar bila ada langkah tipe 2/3, lalu setiap langkah operasional/teknis (tipe 1) menguranginya: CII <- CII - (CII x p/100) x v/100. Biaya per tahun langkah terpilih dijumlahkan.',
      en: 'Combines the selected SEEMP measures sequentially and multiplicatively, reducing to the legacy formulas for a single measure: fuel side first (a fuel switch replaces C_F, at most one per simulation; each auxiliary-energy measure multiplies the remaining AE fuel), then the attained CII is re-rated from the fuel side when a type 2/3 measure is selected, then each operational/technical (type 1) measure reduces it: CII <- CII - (CII x p/100) x v/100. The per-year costs of the selected measures are summed.',
    },
    formulaLatex:
      'CII_0=\\frac{\\left(FC_{ME}+FC_{AE}^{\\prime}\\right)C_F^{\\prime}}{D\\cdot Cap}\\cdot10^{6},\\qquad CII_{after}=CII_0\\prod_{k\\in T_1}\\left(1-\\frac{p_k\\,v_k}{10^{4}}\\right),\\qquad C_{year}=\\sum_k C_{year,k}',
    variables: [
      {
        symbol: 'FC_{AE}^{\\prime}',
        name: {
          id: 'Bahan bakar AE setelah langkah energi bantu',
          en: 'AE fuel after the auxiliary-energy measures',
        },
        unit: 't',
      },
      {
        symbol: 'C_F^{\\prime}',
        name: {
          id: 'Faktor konversi setelah penggantian bahan bakar',
          en: 'Conversion factor after the fuel switch',
        },
        unit: 't CO2/t',
      },
      {
        symbol: 'p_k, v_k',
        name: {
          id: 'Bagian operasional dan nilai reduksi langkah tipe 1',
          en: 'Operational share and reduction value of a type 1 measure',
        },
        unit: '%',
      },
      {
        symbol: 'C_{year,k}',
        name: {
          id: 'Biaya per tahun langkah k',
          en: 'Per-year cost of measure k',
        },
        unit: 'USD/year',
      },
    ],
    constants: [],
    referenceIds: ['platform-spec-v1-1'],
  },
  {
    id: 'emission.dcs_summary',
    catalogued: true,
    domain: 'emission',
    name: {
      id: 'Ringkasan tahunan gaya IMO DCS',
      en: 'IMO DCS-style annual summary',
    },
    status: 'implemented',
    needsCitation: true,
    references: [
      {
        id: 'imo-mepc-278-70',
        title:
          'Amendments to MARPOL Annex VI: Data collection system for fuel oil consumption of ships',
        url: 'https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MEPCDocuments/MEPC.278(70).pdf',
      },
      {
        id: 'imo-fourth-ghg-study-2020',
        title: 'Fourth IMO GHG Study 2020',
        url: 'https://imo.org/en/ourwork/Environment/Pages/Fourth-IMO-Greenhouse-Gas-Study-2020.aspx',
      },
      {
        id: 'ietf-rfc-4180',
        title: 'ietf-rfc-4180',
        url: null,
      },
    ],
    summary: {
      id: 'Ringkasan tahunan sebuah kapal per jenis bahan bakar: bahan bakar mesin induk dan mesin bantu (t), CO2 = bahan bakar x C_F (t), jarak (nm) dan jam berlayar (segmen >= 1 kn), dari segmen terhitung tahun itu atau, bila tidak ada, dari catatan tahunan manual (bahan bakar dengan jenis bahan bakar kapal saat ini, jam tidak diketahui). Diekspor sebagai CSV (RFC 4180). Bukan laporan DCS statutori.',
      en: "Annual summary of a vessel per fuel type: main and auxiliary engine fuel (t), CO2 = fuel x C_F (t), distance (nm) and hours under way (segments at >= 1 kn), from the counted segments of the year or, without them, from the manual annual record (fuel of the vessel's current fuel type, hours unknown). Exported as CSV (RFC 4180). Not the statutory DCS report.",
    },
    formulaLatex:
      'FC_j=\\sum_s\\left(FC_{ME,s,j}+FC_{AE,s,j}\\right),\\quad CO2=\\sum_j FC_j\\,C_{F,j},\\quad D=\\sum_s d_s,\\quad T_{uw}=\\sum_{s:\\,v_s\\ge v_{uw}}\\Delta t_s',
    variables: [
      {
        symbol: 'FC_j',
        name: {
          id: 'Bahan bakar jenis j dalam setahun',
          en: 'Fuel of type j in the year',
        },
        unit: 't',
      },
      {
        symbol: 'C_{F,j}',
        name: {
          id: 'Faktor konversi CO2 bahan bakar j',
          en: 'CO2 conversion factor of fuel j',
        },
        unit: 't CO2/t',
      },
      {
        symbol: 'd_s',
        name: {
          id: 'Jarak segmen',
          en: 'Segment distance',
        },
        unit: 'nm',
      },
      {
        symbol: 'v_s',
        name: {
          id: 'Kecepatan segmen',
          en: 'Segment speed',
        },
        unit: 'kn',
      },
      {
        symbol: '\\Delta t_s',
        name: {
          id: 'Durasi segmen',
          en: 'Segment duration',
        },
        unit: 'h',
      },
    ],
    constants: [
      {
        symbol: 'v_{uw}',
        name: {
          id: 'Kecepatan minimum yang dihitung sebagai berlayar (UNDER_WAY_MIN_SPEED_KN)',
          en: 'Minimum speed counted as under way (UNDER_WAY_MIN_SPEED_KN)',
        },
        value: 1,
        unit: 'kn',
        referenceIds: ['imo-fourth-ghg-study-2020'],
        needsCitation: true,
      },
    ],
    referenceIds: ['imo-mepc-278-70', 'imo-fourth-ghg-study-2020', 'ietf-rfc-4180'],
  },
  {
    id: 'emission.segment_window',
    catalogued: true,
    domain: 'emission',
    name: {
      id: 'Jendela segmen dan penanda celah',
      en: 'Segment window and gap flag',
    },
    status: 'implemented',
    needsCitation: true,
    references: [
      {
        id: 'platform-spec-v1-1',
        title: 'AIS Maritime Intelligence v2 - Engineering Specification, version 1.1',
        url: null,
      },
    ],
    summary: {
      id: 'Peristiwa posisi membentuk segmen dengan posisi sebelumnya dari kapal yang sama: tanpa posisi sebelumnya, atau bila t_kini - t_sebelum <= 0 (tidak berurutan atau duplikat), tidak ada segmen; celah lebih panjang dari SEGMENT_MAX_GAP_MIN (bawaan 360 menit) disimpan sebagai gap dengan bahan bakar nol dan dikeluarkan dari jumlah CII; selain itu menjadi segmen.',
      en: 'A position event forms a segment with the previous fix of the same vessel: no previous fix, or t_current - t_previous <= 0 (out of order or duplicate), gives no segment; a gap longer than SEGMENT_MAX_GAP_MIN (default 360 min) is stored as a gap with zero fuel and excluded from the CII sums; otherwise it is a segment.',
    },
    formulaLatex:
      '\\Delta t=t_i-t_{i-1},\\qquad \\text{segment}\\iff 0<\\Delta t\\le\\Delta t_{max},\\qquad \\text{gap}\\iff\\Delta t>\\Delta t_{max}',
    variables: [
      {
        symbol: '\\Delta t',
        name: {
          id: 'Selang waktu antara posisi sebelumnya dan posisi kini',
          en: 'Time between the previous and the current fix',
        },
        unit: 'min',
      },
    ],
    constants: [
      {
        symbol: '\\Delta t_{max}',
        name: {
          id: 'Celah maksimum sebuah segmen (SEGMENT_MAX_GAP_MIN, dapat dikonfigurasi)',
          en: 'Longest gap of a segment (SEGMENT_MAX_GAP_MIN, configurable)',
        },
        value: 360,
        unit: 'min',
        referenceIds: ['platform-spec-v1-1'],
        needsCitation: true,
      },
    ],
    referenceIds: ['platform-spec-v1-1'],
  },
];

const FACTORS = [
  [2023, 5, 'IMO MEPC.338(76) (G3)'],
  [2024, 7, 'IMO MEPC.338(76) (G3)'],
  [2025, 9, 'IMO MEPC.338(76) (G3)'],
  [2026, 11, 'IMO MEPC.338(76) (G3)'],
  [2027, 13.625, 'IMO MEPC.400(83)'],
  [2028, 16.25, 'IMO MEPC.400(83)'],
  [2029, 18.875, 'IMO MEPC.400(83)'],
  [2030, 21.5, 'IMO MEPC.400(83)'],
].map(([year, zPercent, source]) => ({ year, zPercent, source }));

const G2 = {
  id: 'imo-mepc-353-78',
  title:
    'Resolution MEPC.353(78): 2022 Guidelines on the reference lines for use with operational carbon intensity indicators (CII reference lines guidelines, G2)',
  url: 'https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MEPCDocuments/MEPC.353(78).pdf',
};
const G4 = {
  id: 'imo-mepc-354-78',
  title:
    'Resolution MEPC.354(78): 2022 Guidelines on the operational carbon intensity rating of ships (CII rating guidelines, G4)',
  url: 'https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MEPCDocuments/MEPC.354(78).pdf',
};

// [code, name, capacity unit, a, c, capacityFixed, d1, d2, d3, d4]
const VESSEL_TYPES = [
  [
    'bulk_carrier',
    'Bulk carrier (≥ 279 000 DWT fixed)',
    'DWT',
    4745,
    0.622,
    279000,
    0.86,
    0.94,
    1.06,
    1.18,
  ],
  ['tanker', 'Tanker', 'DWT', 5247, 0.61, null, 0.82, 0.93, 1.08, 1.28],
  ['container_ship', 'Container ship', 'DWT', 1984, 0.489, null, 0.83, 0.94, 1.07, 1.19],
  [
    'general_cargo_ship',
    'General cargo ship (< 20 000 DWT)',
    'DWT',
    588,
    0.3885,
    null,
    0.83,
    0.94,
    1.06,
    1.19,
  ],
  [
    'refrigerated_cargo_carrier',
    'Refrigerated cargo carrier',
    'DWT',
    4600,
    0.557,
    null,
    0.78,
    0.91,
    1.07,
    1.2,
  ],
  ['gas_carrier', 'Gas carrier (< 65 000 DWT)', 'DWT', 8104, 0.639, null, 0.85, 0.95, 1.06, 1.25],
  ['lng_carrier', 'LNG carrier (≥ 100 000 DWT)', 'DWT', 9.827, 0, null, 0.89, 0.98, 1.06, 1.13],
  [
    'ro_ro_cargo_ship_vc',
    'Ro-ro cargo ship (vehicle carrier)',
    'GT',
    5739,
    0.631,
    null,
    0.86,
    0.94,
    1.06,
    1.16,
  ],
  ['ro_ro_passenger_ship', 'Ro-ro passenger ship', 'GT', 7540, 0.587, null, 0.72, 0.9, 1.12, 1.41],
  [
    'cruise_passenger_ship',
    'Cruise passenger ship',
    'GT',
    930,
    0.383,
    null,
    0.87,
    0.95,
    1.06,
    1.16,
  ],
  ['combination_carrier', 'Combination carrier', 'DWT', 40853, 0.812, null, 0.87, 0.96, 1.06, 1.14],
].map(([code, name, capacityUnit, a, c, capacityFixed, d1, d2, d3, d4], index) => ({
  id: `0192f0c8-7d3a-7c2e-9a1c-${String(index + 101).padStart(12, '0')}`,
  code,
  name,
  capacityUnit,
  a,
  c,
  capacityFixed,
  d: { d1, d2, d3, d4 },
  references: [G2, G4],
}));

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/emission/methodology',
    handler: ({ send }) =>
      send(200, {
        service: 'emission',
        methods: SERVICE_METHODS,
        reductionFactors: FACTORS,
        vesselTypes: VESSEL_TYPES,
        attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
      }),
  },
];

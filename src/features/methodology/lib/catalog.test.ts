import type { Method, Reference } from '@darmawanweb/ais-its-contracts/references';
import { describe, expect, it } from 'vitest';

import type { MethodSummaryDto } from '@/shared/api/generated/emission/model';

import {
  catalogStats,
  citingMethods,
  filterMethods,
  filterReferences,
  formatCitation,
  fromService,
  isFiltered,
  mergeMethods,
  NO_METHOD_FILTER,
  orderedDomains,
  referenceIdsOf,
  sortReferences,
  valuesOf,
} from './catalog';

const text = (value: string) => ({ id: value, en: value });

const method = (patch: Partial<Method> & Pick<Method, 'id' | 'domain'>): Method =>
  ({
    name: text(patch.id),
    summary: null,
    formulaLatex: null,
    variables: [],
    constants: [],
    referenceIds: [],
    implementedBy: { service: 'emission', module: 'src/domain/cii.ts#attained' },
    legacy: [],
    status: 'implemented',
    needsCitation: false,
    notes: null,
    ...patch,
  }) as Method;

const reference = (patch: Partial<Reference> & Pick<Reference, 'id'>): Reference => ({
  type: 'regulation',
  title: `Title ${patch.id}`,
  issuerOrAuthors: 'IMO MEPC',
  year: 2022,
  identifier: null,
  url: null,
  license: null,
  accessed: null,
  verification: 'verified',
  notes: null,
  ...patch,
});

const CATALOG = [
  method({
    id: 'cii.attained_accumulation',
    domain: 'emission',
    name: { id: 'CII tercapai', en: 'Attained CII' },
    referenceIds: ['imo-mepc-352-78'],
    variables: [{ symbol: 'C_F', name: text('conversion factor'), unit: 't/t' }],
  }),
  method({
    id: 'ais.dedup',
    domain: 'ais',
    status: 'planned',
    needsCitation: true,
    constants: [
      {
        symbol: 'd_{dup}',
        name: text('duplicate threshold'),
        value: 0.1,
        unit: 'm',
        referenceIds: ['thesis'],
        needsCitation: true,
      },
    ],
  }),
  method({ id: 'notify.dedup', domain: 'notification', referenceIds: ['imo-mepc-352-78'] }),
];

const SERVICE: MethodSummaryDto[] = [
  {
    id: 'cii.attained_accumulation',
    catalogued: true,
    domain: 'emission',
    name: null,
    status: null,
    needsCitation: false,
    references: [],
    summary: null,
    formulaLatex: null,
    variables: [],
    constants: [],
    referenceIds: [],
  },
  {
    id: 'cii.year_end_projection',
    catalogued: false,
    domain: 'emission',
    name: { id: 'Proyeksi akhir tahun', en: 'Year-end projection' },
    status: 'implemented',
    needsCitation: false,
    references: [{ id: 'v2', title: 'Platform spec', url: null }],
    summary: null,
    formulaLatex: '\\hat{x} = x / f',
    variables: [],
    constants: [],
    referenceIds: [],
  },
];

describe('methods', () => {
  it('merges uncatalogued service methods after the catalog (catalog wins)', () => {
    const methods = mergeMethods(CATALOG, SERVICE, 'emission');
    expect(methods.map((item) => [item.id, item.origin])).toEqual([
      ['cii.attained_accumulation', 'catalog'],
      ['ais.dedup', 'catalog'],
      ['notify.dedup', 'catalog'],
      ['cii.year_end_projection', 'service'],
    ]);
    expect(fromService(SERVICE[0]!, 'emission')).toBeNull();
    expect(fromService(SERVICE[1]!, 'emission')).toMatchObject({
      implementedBy: { service: 'emission', module: '' },
      inlineReferences: [{ id: 'v2', title: 'Platform spec', url: null }],
    });
  });

  it('orders domains (known first) and filters by term, domain, status and citation', () => {
    const methods = mergeMethods(CATALOG, SERVICE, 'emission');
    expect(orderedDomains(methods)).toEqual(['ais', 'emission', 'notification']);
    expect(filterMethods(methods, { ...NO_METHOD_FILTER, term: 'C_F' }).map((m) => m.id)).toEqual([
      'cii.attained_accumulation',
    ]);
    expect(filterMethods(methods, { ...NO_METHOD_FILTER, term: 'attained cii' })).toHaveLength(1);
    expect(filterMethods(methods, { ...NO_METHOD_FILTER, status: 'planned' })).toHaveLength(1);
    expect(filterMethods(methods, { ...NO_METHOD_FILTER, needsCitation: true })).toHaveLength(1);
    expect(filterMethods(methods, { ...NO_METHOD_FILTER, domain: 'emission' })).toHaveLength(2);
    expect(isFiltered(NO_METHOD_FILTER)).toBe(false);
    expect(isFiltered({ ...NO_METHOD_FILTER, term: ' x ' })).toBe(true);
    expect(valuesOf(methods, 'status')).toEqual(['implemented', 'planned']);
  });

  it('maps references to the methods citing them, constants included', () => {
    const methods = mergeMethods(CATALOG, [], 'emission');
    const citing = citingMethods(methods);
    expect(citing.get('imo-mepc-352-78')).toEqual(['cii.attained_accumulation', 'notify.dedup']);
    expect(citing.get('thesis')).toEqual(['ais.dedup']);
    expect(referenceIdsOf(methods[1]!)).toEqual(['thesis']);
  });
});

describe('bibliography', () => {
  const references = [
    reference({ id: 'b', issuerOrAuthors: 'Kwon, Y. J.', year: 2008, type: 'paper' }),
    reference({
      id: 'a',
      title:
        'Guidelines on the operational carbon intensity rating of ships (CII rating guidelines, G4).',
      identifier: 'Resolution MEPC.354(78).',
      url: 'https://www.imo.org/g4.pdf',
      accessed: '2026-11-20',
      verification: 'corrected',
    }),
    reference({ id: 'c', issuerOrAuthors: 'IMO MEPC', year: 2021, verification: 'unverified' }),
  ];

  it('searches, filters and sorts like a bibliography', () => {
    expect(
      filterReferences(references, { term: 'mepc.354', type: 'all', verification: 'all' }),
    ).toHaveLength(1);
    expect(
      filterReferences(references, { term: '', type: 'paper', verification: 'all' }).map(
        (item) => item.id,
      ),
    ).toEqual(['b']);
    expect(
      filterReferences(references, { term: '', type: 'all', verification: 'unverified' }),
    ).toHaveLength(1);
    expect(sortReferences(references).map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });

  it('formats an author–date citation', () => {
    expect(formatCitation(references[1]!, 'diakses')).toBe(
      'IMO MEPC (2022). Guidelines on the operational carbon intensity rating of ships (CII rating guidelines, G4). Resolution MEPC.354(78). https://www.imo.org/g4.pdf (diakses 2026-11-20)',
    );
    expect(formatCitation(references[0]!)).toBe('Kwon, Y. J. (2008). Title b.');
  });

  it('summarizes the catalog', () => {
    const stats = catalogStats(mergeMethods(CATALOG, [], 'emission'), references);
    expect(stats).toMatchObject({
      methods: 3,
      domains: 3,
      implemented: 2,
      needsCitation: 1,
      references: 3,
      verified: 1,
    });
    expect(stats.verifiedShare).toBeCloseTo(1 / 3);
  });
});

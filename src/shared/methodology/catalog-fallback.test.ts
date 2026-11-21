import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw/server';

import { loadMethodCatalog } from './catalog';

// A contracts release without catalog data (0.2.0 shipped it empty).
vi.mock('@darmawanweb/ais-its-contracts/references', () => ({ METHODS: [], REFERENCES: [] }));

const METHOD = {
  id: 'ews.pipeline_distance_status',
  domain: 'safety',
  name: { id: 'Status EWS', en: 'EWS status' },
  summary: { id: 'Jarak ke pipa', en: 'Distance to the pipeline' },
  formulaLatex: 'd \\le 500',
  referenceIds: ['thesis-ews'],
  status: 'implemented',
};
const REFERENCE = {
  id: 'thesis-ews',
  type: 'thesis',
  title: 'EWS thesis',
  issuerOrAuthors: 'ITS',
  verification: 'unverified',
};

describe('methodology catalog fallback', () => {
  it('reads the JSON copy of docs/references served at /methodology/*.json', async () => {
    server.use(
      http.get('*/methodology/methods.json', () => HttpResponse.json({ methods: [METHOD] })),
      http.get('*/methodology/references.json', () => HttpResponse.json([REFERENCE])),
    );
    const catalog = await loadMethodCatalog();
    expect(catalog?.source).toBe('json');
    expect(catalog!.getMethod('ews.pipeline_distance_status')?.constants).toEqual([]);
    expect(catalog!.referencesOfMethod('ews.pipeline_distance_status')[0]?.title).toBe(
      'EWS thesis',
    );
    expect(catalog!.labels.domain('safety', 'id')).toBe('Keselamatan navigasi');
  });

  it('returns null (MethodInfo shows "source pending") without any catalog', async () => {
    server.use(
      http.get('*/methodology/methods.json', () => new HttpResponse(null, { status: 404 })),
      http.get('*/methodology/references.json', () => new HttpResponse(null, { status: 404 })),
    );
    expect(await loadMethodCatalog()).toBeNull();
  });
});

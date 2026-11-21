import { describe, expect, it } from 'vitest';

import { loadMethodCatalog } from './catalog';

describe('methodology catalog (contracts ./references)', () => {
  it('reads REFERENCES and METHODS from @darmawanweb/ais-its-contracts', async () => {
    const catalog = await loadMethodCatalog();
    expect(catalog?.source).toBe('contracts');
    expect(catalog!.methods.length).toBeGreaterThan(50);
    const method = catalog!.getMethod('cii.rating_grade');
    expect(method?.name.id).toBeTruthy();
    expect(method?.formulaLatex ?? method?.summary.en).toBeTruthy();
    expect(catalog!.referencesOfMethod('cii.rating_grade').length).toBeGreaterThan(0);
    expect(catalog!.methodsByDomain('safety').map((m) => m.id)).toContain('collision.cpa_tcpa');
    expect(catalog!.labels.domain('emission', 'id')).toBe('Bahan bakar, emisi dan CII');
  });
});

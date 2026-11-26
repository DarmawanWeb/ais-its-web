import { describe, expect, it } from 'vitest';

import { checkCompleteness, checkI18n } from './i18n-check.mjs';

describe('i18n completeness', () => {
  it('has every key of every namespace in id and en, and no unused namespace', () => {
    const { namespaces, problems } = checkI18n();
    expect(namespaces).toContain('common');
    expect(problems).toEqual([]);
  });

  it('reports missing keys, empty values and different placeholders', () => {
    const problems = checkCompleteness(
      new Map([
        [
          'demo',
          {
            id: { a: 'A {{name}}', b: '', items_other: '{{count}} item', only: 'x' },
            en: { a: 'A {{who}}', b: 'B', items_one: 'one item', items_other: '{{count}} items' },
          },
        ],
      ]),
    );
    expect(problems).toEqual([
      'demo: "only" missing in en',
      'demo: "b" is empty in id',
      'demo: "a" placeholders differ (id {{name}}, en {{who}})',
    ]);
  });
});

import type { Method, Reference } from '@darmawanweb/ais-its-contracts/references';

import type { MethodSummaryDto } from '@/shared/api/generated/emission/model';

export type Locale = 'id' | 'en';

export interface Localized {
  id: string;
  en: string;
}

/** A method of the page: from the shipped catalog, or served by a service but not catalogued yet. */
export interface DisplayMethod {
  id: string;
  domain: string;
  name: Localized;
  summary: Localized | null;
  formulaLatex: string | null;
  variables: { symbol: string; name: Localized; unit: string | null }[];
  constants: {
    symbol: string;
    name: Localized;
    value: number | string;
    unit: string | null;
    referenceIds: string[];
    needsCitation: boolean;
  }[];
  referenceIds: string[];
  implementedBy: { service: string; module: string } | null;
  legacy: string[];
  status: string;
  needsCitation: boolean;
  notes: Localized | null;
  /** catalog = METHODS of the contracts package; service = only in a service's methodology endpoint. */
  origin: 'catalog' | 'service';
  /** Sources sent with an uncatalogued method (not in REFERENCES). */
  inlineReferences: { id: string; title: string; url: string | null }[];
}

/** Display order of the method domains (spec §17: domains include notification and security). */
export const DOMAIN_ORDER = [
  'ais',
  'geo',
  'emission',
  'seemp',
  'telemetry',
  'safety',
  'surveillance',
  'notification',
  'security',
] as const;

export function fromCatalog(method: Method): DisplayMethod {
  return {
    id: method.id,
    domain: method.domain,
    name: method.name,
    summary: method.summary,
    formulaLatex: method.formulaLatex,
    variables: method.variables.map((variable) => ({ ...variable })),
    constants: method.constants.map((constant) => ({
      ...constant,
      referenceIds: [...constant.referenceIds],
    })),
    referenceIds: [...method.referenceIds],
    implementedBy: method.implementedBy,
    legacy: [...method.legacy],
    status: method.status,
    needsCitation: method.needsCitation,
    notes: method.notes,
    origin: 'catalog',
    inlineReferences: [],
  };
}

/**
 * Methods a service implements that the shipped catalog does not describe yet
 * (`catalogued: false` in `GET /emission/methodology`), as display methods of `service`.
 */
export function fromService(method: MethodSummaryDto, service: string): DisplayMethod | null {
  if (method.catalogued || !method.name) return null;
  return {
    id: method.id,
    domain: method.domain ?? service,
    name: method.name,
    summary: method.summary,
    formulaLatex: method.formulaLatex,
    variables: method.variables.map((variable) => ({ ...variable })),
    constants: method.constants.map((constant) => ({
      ...constant,
      referenceIds: [...constant.referenceIds],
    })),
    referenceIds: [...method.referenceIds],
    implementedBy: { service, module: '' },
    legacy: [],
    status: method.status ?? 'implemented',
    needsCitation: method.needsCitation,
    notes: null,
    origin: 'service',
    inlineReferences: method.references,
  };
}

/** Catalog methods followed by the uncatalogued service methods (unique ids, catalog wins). */
export function mergeMethods(
  catalog: readonly Method[],
  serviceMethods: readonly MethodSummaryDto[],
  service: string,
): DisplayMethod[] {
  const methods = catalog.map(fromCatalog);
  const known = new Set(methods.map((method) => method.id));
  for (const summary of serviceMethods) {
    if (known.has(summary.id)) continue;
    const method = fromService(summary, service);
    if (method) {
      methods.push(method);
      known.add(method.id);
    }
  }
  return methods;
}

/** Domains present in `methods`, known ones in `DOMAIN_ORDER`, then the others alphabetically. */
export function orderedDomains(methods: readonly Pick<DisplayMethod, 'domain'>[]): string[] {
  const present = new Set(methods.map((method) => method.domain));
  const known = DOMAIN_ORDER.filter((domain) => present.has(domain));
  const others = [...present]
    .filter((domain) => !(DOMAIN_ORDER as readonly string[]).includes(domain))
    .sort();
  return [...known, ...others];
}

export interface MethodFilter {
  term: string;
  domain: string;
  status: string;
  needsCitation: boolean;
}

export const NO_METHOD_FILTER: MethodFilter = {
  term: '',
  domain: 'all',
  status: 'all',
  needsCitation: false,
};

function haystack(method: DisplayMethod): string {
  return [
    method.id,
    method.name.id,
    method.name.en,
    method.summary?.id ?? '',
    method.summary?.en ?? '',
    method.formulaLatex ?? '',
    method.implementedBy?.module ?? '',
    ...method.variables.flatMap((variable) => [
      variable.symbol,
      variable.name.id,
      variable.name.en,
    ]),
    ...method.constants.flatMap((constant) => [
      constant.symbol,
      constant.name.id,
      constant.name.en,
    ]),
  ]
    .join(' ')
    .toLowerCase();
}

/** Methods matching a search term (id, names, summaries, symbols, module), domain and status. */
export function filterMethods(
  methods: readonly DisplayMethod[],
  filter: MethodFilter,
): DisplayMethod[] {
  const term = filter.term.trim().toLowerCase();
  return methods.filter(
    (method) =>
      (filter.domain === 'all' || method.domain === filter.domain) &&
      (filter.status === 'all' || method.status === filter.status) &&
      (!filter.needsCitation ||
        method.needsCitation ||
        method.constants.some((c) => c.needsCitation)) &&
      (!term || haystack(method).includes(term)),
  );
}

export function isFiltered(filter: MethodFilter): boolean {
  return (
    filter.term.trim() !== '' ||
    filter.domain !== 'all' ||
    filter.status !== 'all' ||
    filter.needsCitation
  );
}

/** Ids of the methods citing each reference (directly or through a constant). */
export function citingMethods(methods: readonly DisplayMethod[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const method of methods) {
    const ids = new Set([
      ...method.referenceIds,
      ...method.constants.flatMap((c) => c.referenceIds),
    ]);
    for (const id of ids) map.set(id, [...(map.get(id) ?? []), method.id]);
  }
  return map;
}

/** References of a method and of its constants, in citation order, without duplicates. */
export function referenceIdsOf(method: DisplayMethod): string[] {
  return [...new Set([...method.referenceIds, ...method.constants.flatMap((c) => c.referenceIds)])];
}

export interface ReferenceFilter {
  term: string;
  type: string;
  verification: string;
}

export const NO_REFERENCE_FILTER: ReferenceFilter = { term: '', type: 'all', verification: 'all' };

/** References matching a term (title, authors, identifier, id, notes), a type and a verification. */
export function filterReferences(
  references: readonly Reference[],
  filter: ReferenceFilter,
): Reference[] {
  const term = filter.term.trim().toLowerCase();
  return references.filter(
    (reference) =>
      (filter.type === 'all' || reference.type === filter.type) &&
      (filter.verification === 'all' || reference.verification === filter.verification) &&
      (!term ||
        [
          reference.id,
          reference.title,
          reference.issuerOrAuthors,
          reference.identifier ?? '',
          reference.notes ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(term)),
  );
}

/** Bibliography order: authors / issuer, then year, then title. */
export function sortReferences(references: readonly Reference[]): Reference[] {
  return [...references].sort(
    (a, b) =>
      a.issuerOrAuthors.localeCompare(b.issuerOrAuthors) ||
      (a.year ?? 0) - (b.year ?? 0) ||
      a.title.localeCompare(b.title),
  );
}

/**
 * Citation of a reference in an author–date style:
 * `Authors (Year). Title. Identifier. URL (accessed YYYY-MM-DD)`.
 */
export function formatCitation(reference: Reference, accessedLabel = 'accessed'): string {
  const parts = [
    `${reference.issuerOrAuthors}${reference.year ? ` (${reference.year})` : ''}.`,
    `${reference.title.replace(/\.$/, '')}.`,
  ];
  if (reference.identifier) parts.push(`${reference.identifier.replace(/\.$/, '')}.`);
  if (reference.url)
    parts.push(
      reference.accessed
        ? `${reference.url} (${accessedLabel} ${reference.accessed})`
        : reference.url,
    );
  return parts.join(' ');
}

/** Counts of the methods and references for the summary strip. */
export function catalogStats(methods: readonly DisplayMethod[], references: readonly Reference[]) {
  const domains = new Set(methods.map((method) => method.domain));
  const implemented = methods.filter((method) => method.status === 'implemented').length;
  const needsCitation = methods.filter((method) => method.needsCitation).length;
  const verified = references.filter((reference) => reference.verification === 'verified').length;
  return {
    methods: methods.length,
    domains: domains.size,
    implemented,
    needsCitation,
    references: references.length,
    verified,
    verifiedShare: references.length > 0 ? verified / references.length : 0,
  };
}

/** Values of the open vocabularies present in a list, sorted. */
export function valuesOf<T, K extends keyof T>(items: readonly T[], key: K): string[] {
  return [...new Set(items.map((item) => String(item[key])))].sort();
}

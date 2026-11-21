import type { Method, MethodDomain, Reference } from '@darmawanweb/ais-its-contracts/references';
import { useQuery } from '@tanstack/react-query';
import * as z from 'zod';

/*
 * Only type imports from '@darmawanweb/ais-its-contracts/references' outside the dynamic
 * import below: a static import would pull the whole catalog into the main bundle.
 */

/**
 * Methodology catalog (spec §17) for MethodInfo popovers and the methodology page.
 *
 * Resolution order:
 *  1. `@darmawanweb/ais-its-contracts/references` (REFERENCES, METHODS) — loaded lazily so the
 *     catalog is a separate chunk;
 *  2. a copy of docs/references/{methods,references}.json served at /methodology/*.json
 *     (`pnpm methodology:sync`; not needed while contracts ships the catalog — 0.3.0+);
 *  3. null → components render a graceful "source pending" state.
 */
export interface MethodCatalog {
  readonly source: 'contracts' | 'json';
  readonly methods: readonly Method[];
  readonly references: readonly Reference[];
  getMethod(id: string): Method | undefined;
  getReference(id: string): Reference | undefined;
  /** References of the method and of its constants, without duplicates. */
  referencesOfMethod(id: string): readonly Reference[];
  methodsByDomain(domain: MethodDomain): readonly Method[];
  /** Localized vocabulary labels (from contracts; identity for the JSON fallback). */
  readonly labels: CatalogLabels;
}

export interface CatalogLabels {
  domain(domain: string, locale: 'id' | 'en'): string;
  status(status: string, locale: 'id' | 'en'): string;
  referenceType(type: string, locale: 'id' | 'en'): string;
}

type Labels = Readonly<Record<string, { id: string; en: string }>>;

/* Vocabulary labels for the JSON fallback (same values as the contracts catalog vocabulary). */
const DOMAIN_LABELS: Labels = {
  ais: { en: 'AIS processing', id: 'Pengolahan AIS' },
  emission: { en: 'Fuel, emission and CII', id: 'Bahan bakar, emisi dan CII' },
  seemp: { en: 'SEEMP', id: 'SEEMP' },
  telemetry: { en: 'Telemetry', id: 'Telemetri' },
  geo: { en: 'Geospatial', id: 'Geospasial' },
  safety: { en: 'Navigational safety', id: 'Keselamatan navigasi' },
  surveillance: { en: 'Surveillance', id: 'Pengawasan' },
};
const STATUS_LABELS: Labels = {
  implemented: { en: 'Implemented', id: 'Diimplementasikan' },
  planned: { en: 'Planned', id: 'Direncanakan' },
  deprecated: { en: 'Deprecated', id: 'Tidak digunakan lagi' },
};
const REFERENCE_TYPE_LABELS: Labels = {
  regulation: { en: 'Regulation', id: 'Regulasi' },
  guideline: { en: 'Guideline', id: 'Pedoman' },
  standard: { en: 'Standard', id: 'Standar' },
  paper: { en: 'Scientific paper', id: 'Artikel ilmiah' },
  book: { en: 'Book', id: 'Buku' },
  thesis: { en: 'Thesis', id: 'Tesis / skripsi' },
  report: { en: 'Report', id: 'Laporan' },
  dataset: { en: 'Dataset', id: 'Dataset' },
  software: { en: 'Software', id: 'Perangkat lunak' },
  website: { en: 'Website', id: 'Situs web' },
  legacy_code: { en: 'Legacy code (MVP)', id: 'Kode lama (MVP)' },
};

const label = (labels: Labels) => (value: string, locale: 'id' | 'en') =>
  labels[value]?.[locale] ?? value;

const FALLBACK_LABELS: CatalogLabels = {
  domain: label(DOMAIN_LABELS),
  status: label(STATUS_LABELS),
  referenceType: label(REFERENCE_TYPE_LABELS),
};

function buildCatalog(
  source: MethodCatalog['source'],
  methods: readonly Method[],
  references: readonly Reference[],
  labels: CatalogLabels = FALLBACK_LABELS,
): MethodCatalog {
  const methodIndex = new Map(methods.map((method) => [method.id, method]));
  const referenceIndex = new Map(references.map((reference) => [reference.id, reference]));
  return {
    source,
    methods,
    references,
    labels,
    getMethod: (id) => methodIndex.get(id),
    getReference: (id) => referenceIndex.get(id),
    referencesOfMethod: (id) => {
      const method = methodIndex.get(id);
      if (!method) return [];
      const ids = new Set([
        ...method.referenceIds,
        ...method.constants.flatMap((constant) => constant.referenceIds),
      ]);
      return [...ids].flatMap((refId) => {
        const reference = referenceIndex.get(refId);
        return reference ? [reference] : [];
      });
    },
    methodsByDomain: (domain) => methods.filter((method) => method.domain === domain),
  };
}

const LocalizedSchema = z.object({ id: z.string(), en: z.string() });

/** Typed loader of the JSON copy (lenient: defaults for optional members). */
const JsonMethodSchema = z.looseObject({
  id: z.string(),
  domain: z.string(),
  name: LocalizedSchema,
  summary: LocalizedSchema,
  formulaLatex: z.string().nullable().default(null),
  variables: z
    .array(
      z.object({
        symbol: z.string(),
        name: LocalizedSchema,
        unit: z.string().nullable().default(null),
      }),
    )
    .default([]),
  constants: z
    .array(
      z.object({
        symbol: z.string(),
        name: LocalizedSchema,
        value: z.union([z.number(), z.string()]),
        unit: z.string().nullable().default(null),
        referenceIds: z.array(z.string()).default([]),
        needsCitation: z.boolean().default(false),
      }),
    )
    .default([]),
  referenceIds: z.array(z.string()).default([]),
  implementedBy: z.object({ service: z.string(), module: z.string() }).nullable().default(null),
  legacy: z.array(z.string()).default([]),
  status: z.string(),
  needsCitation: z.boolean().default(false),
  notes: LocalizedSchema.nullable().default(null),
});

const JsonReferenceSchema = z.looseObject({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  issuerOrAuthors: z.string(),
  year: z.number().nullable().default(null),
  identifier: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
  license: z.string().nullable().default(null),
  accessed: z.string().nullable().default(null),
  verification: z.string(),
  notes: z.string().nullable().default(null),
});

async function fetchList<T extends z.ZodType>(url: string, key: string, schema: T) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const body: unknown = await response.json();
  const list = Array.isArray(body) ? body : (body as Record<string, unknown> | null)?.[key];
  return z.array(schema).parse(list);
}

export async function loadMethodCatalog(): Promise<MethodCatalog | null> {
  try {
    const contracts = await import('@darmawanweb/ais-its-contracts/references');
    if (Array.isArray(contracts.METHODS) && contracts.METHODS.length > 0) {
      return buildCatalog('contracts', contracts.METHODS, contracts.REFERENCES, {
        domain: contracts.methodDomainLabel,
        status: contracts.methodStatusLabel,
        referenceType: contracts.referenceTypeLabel,
      });
    }
  } catch (error) {
    console.warn('Methodology catalog not available from contracts', error);
  }
  try {
    const [methods, references] = await Promise.all([
      fetchList('/methodology/methods.json', 'methods', JsonMethodSchema),
      fetchList('/methodology/references.json', 'references', JsonReferenceSchema),
    ]);
    return buildCatalog('json', methods, references);
  } catch {
    return null;
  }
}

export const methodCatalogKey = ['methodology', 'catalog'] as const;

/** The catalog (cached forever once loaded); null when no source is available. */
export function useMethodCatalog(enabled = true) {
  return useQuery({
    queryKey: methodCatalogKey,
    queryFn: loadMethodCatalog,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    enabled,
    retry: false,
  });
}

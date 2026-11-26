#!/usr/bin/env node
/**
 * i18n completeness check (`pnpm i18n:check`, also run by `pnpm test`):
 *  - every namespace (`common` + one per feature) has the same keys in id and en; plural forms
 *    count once (`_one`/`_other`: Indonesian has only "other"), and each key uses the same
 *    `{{placeholders}}` in both languages;
 *  - no value is empty;
 *  - every namespace is used by the code (`useTranslation('<ns>')`, `t('<ns>:…')`, `<ns>:` keys)
 *    and every namespace the code names exists.
 * Exits with 1 and one line per problem.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const LANGUAGES = ['id', 'en'];
const PLURAL = /_(zero|one|two|few|many|other)$/;

function flatten(value, prefix = '', out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, path, out);
    else out.set(path, child);
  }
  return out;
}

const placeholders = (text) =>
  typeof text === 'string'
    ? [...text.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]).toSorted()
    : [];

/** Translation files: `common` (shared) and every feature namespace. */
export function loadNamespaces(root = ROOT) {
  const namespaces = new Map();
  const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
  namespaces.set(
    'common',
    Object.fromEntries(
      LANGUAGES.map((lang) => [
        lang,
        read(join(root, `src/shared/i18n/locales/${lang}/common.json`)),
      ]),
    ),
  );
  const featuresDir = join(root, 'src/features');
  for (const feature of readdirSync(featuresDir)) {
    const dir = join(featuresDir, feature, 'i18n');
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    namespaces.set(
      feature,
      Object.fromEntries(LANGUAGES.map((lang) => [lang, read(join(dir, `${lang}.json`))])),
    );
  }
  return namespaces;
}

/** Problems of the key sets and placeholders of each namespace. */
export function checkCompleteness(namespaces) {
  const problems = [];
  for (const [namespace, byLanguage] of namespaces) {
    const flat = Object.fromEntries(
      LANGUAGES.map((lang) => [lang, flatten(byLanguage[lang] ?? {})]),
    );
    const bases = Object.fromEntries(
      LANGUAGES.map((lang) => [
        lang,
        new Set([...flat[lang].keys()].map((k) => k.replace(PLURAL, ''))),
      ]),
    );
    for (const lang of LANGUAGES) {
      const other = LANGUAGES.find((l) => l !== lang);
      for (const base of bases[lang])
        if (!bases[other].has(base)) problems.push(`${namespace}: "${base}" missing in ${other}`);
      for (const [key, value] of flat[lang]) {
        // lists (`t(key, { returnObjects: true })`) are arrays of non-empty strings
        const texts = Array.isArray(value) ? value : [value];
        if (
          texts.length === 0 ||
          texts.some((text) => typeof text !== 'string' || text.trim() === '')
        )
          problems.push(`${namespace}: "${key}" is empty in ${lang}`);
        const counterpart = flat[other].get(key);
        if (
          Array.isArray(value) &&
          Array.isArray(counterpart) &&
          value.length !== counterpart.length
        )
          problems.push(
            `${namespace}: "${key}" has ${value.length} items in ${lang}, ${counterpart.length} in ${other}`,
          );
      }
    }
    // same placeholders: compare each key with its counterpart (plural forms with "other")
    for (const [key, value] of flat.id) {
      const base = key.replace(PLURAL, '');
      const counterpart = flat.en.get(key) ?? flat.en.get(`${base}_other`) ?? flat.en.get(base);
      if (counterpart === undefined) continue;
      const a = placeholders(value).filter((name) => name !== 'count');
      const b = placeholders(counterpart).filter((name) => name !== 'count');
      if (a.join(',') !== b.join(','))
        problems.push(`${namespace}: "${key}" placeholders differ (id {{${a}}}, en {{${b}}})`);
    }
  }
  return problems;
}

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'generated' && entry.name !== 'i18n') sourceFiles(path, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** Namespaces nobody uses, and namespaces the code names that do not exist. */
export function checkNamespaceUsage(namespaces, root = ROOT) {
  const problems = [];
  const used = new Set();
  const declared = new Map(); // useTranslation('<ns>') → first file
  for (const file of sourceFiles(join(root, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/useTranslation\(\s*['"]([\w-]+)['"]/g)) {
      used.add(m[1]);
      if (!declared.has(m[1])) declared.set(m[1], relative(root, file));
    }
    // `t('<ns>:key')`, `labelKey: '<ns>:nav.x'` (other `a:b` strings are no namespaces)
    for (const m of text.matchAll(/['"`]([a-z][\w-]*):[a-zA-Z][\w.]*['"`]/g)) used.add(m[1]);
  }
  for (const namespace of namespaces.keys())
    if (!used.has(namespace)) problems.push(`namespace "${namespace}" is never used`);
  for (const [namespace, file] of declared)
    if (!namespaces.has(namespace))
      problems.push(`namespace "${namespace}" is used (${file}) but has no translations`);
  return problems;
}

export function checkI18n(root = ROOT) {
  const namespaces = loadNamespaces(root);
  return {
    namespaces: [...namespaces.keys()],
    problems: [...checkCompleteness(namespaces), ...checkNamespaceUsage(namespaces, root)],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const { namespaces, problems } = checkI18n();
  if (problems.length > 0) {
    for (const problem of problems) console.error(`i18n: ${problem}`);
    process.exit(1);
  }
  console.log(`i18n: ${namespaces.length} namespaces complete in ${LANGUAGES.join(' + ')}`);
}

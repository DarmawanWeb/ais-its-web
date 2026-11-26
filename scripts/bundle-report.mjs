#!/usr/bin/env node
/**
 * Route-level code splitting report of a production build (`pnpm build && pnpm bundle:report`,
 * or `node scripts/bundle-report.mjs <dist dir>`):
 *  - the initial load: the entry chunk of index.html and its static imports;
 *  - every lazy page chunk (`*-page-<hash>.js`) with what it adds on top of the initial load;
 *  - the chunks that pull MapLibre GL or deck.gl.
 * Fails when MapLibre or deck.gl is part of the initial load, when a map vendor chunk is part of a
 * static import cycle (chunks that import each other evaluate in the wrong order: deck.gl threw
 * "t is not a constructor" when its dependency mjolnir.js shared an app chunk), or when a page
 * that does not render a map pulls them (`--strict`, the map pages are listed in MAP_PAGES).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = resolve(process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'dist');
const strict = process.argv.includes('--strict');
const assets = join(dist, 'assets');

/** Pages that render a map (MapView), so MapLibre and deck.gl are expected there. */
const MAP_PAGES = [
  'live-map-page',
  'ews-page',
  'collision-page',
  'alerts-page',
  'overview-page',
  'transhipment-page',
  'transhipment-detail-page',
  'fishing-page',
  'dark-page',
  'anomaly-page',
  'zones-page',
  'zone-editor-page',
  'detail-page',
  'dashboard-page',
];

const files = readdirSync(assets).filter((name) => name.endsWith('.js'));
const sizes = new Map(
  files.map((name) => {
    const buffer = readFileSync(join(assets, name));
    return [name, { raw: buffer.length, gzip: gzipSync(buffer).length }];
  }),
);
const source = new Map(files.map((name) => [name, readFileSync(join(assets, name), 'utf8')]));

/** Static (`import … from "./x.js"`, `import "./x.js"`) and dynamic imports of a chunk. */
function importsOf(name) {
  const text = source.get(name) ?? '';
  const staticImports = new Set();
  const dynamicImports = new Set();
  for (const m of text.matchAll(
    /(?:^|[;\s}])import\s*(?:[\w*{}\s,$]+from\s*)?["']\.\/([^"']+\.js)["']/g,
  ))
    staticImports.add(m[1]);
  for (const m of text.matchAll(/import\(\s*["']\.\/([^"']+\.js)["']\s*\)/g))
    dynamicImports.add(m[1]);
  // Vite's preload helper lists dependencies as "assets/x.js" strings
  for (const m of text.matchAll(/["']assets\/([^"']+\.js)["']/g)) dynamicImports.add(m[1]);
  for (const s of staticImports) dynamicImports.delete(s);
  return { staticImports, dynamicImports };
}

function closure(roots) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length > 0) {
    const name = stack.pop();
    if (seen.has(name) || !source.has(name)) continue;
    seen.add(name);
    for (const next of importsOf(name).staticImports) stack.push(next);
  }
  return seen;
}

const total = (names) =>
  [...names].reduce(
    (sum, name) => ({
      raw: sum.raw + (sizes.get(name)?.raw ?? 0),
      gzip: sum.gzip + (sizes.get(name)?.gzip ?? 0),
    }),
    { raw: 0, gzip: 0 },
  );
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
const isVendor = (name, vendor) => name.startsWith(`${vendor}-`);
const MAP_VENDORS = ['vendor-maplibre', 'vendor-deckgl'];

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entries = [...html.matchAll(/<script[^>]+src="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
const initial = closure(entries);
const initialSize = total(initial);

const problems = [];
const initialMapVendors = [...initial].filter((name) =>
  MAP_VENDORS.some((vendor) => isVendor(name, vendor)),
);
if (initialMapVendors.length > 0)
  problems.push(`MapLibre/deck.gl in the initial load: ${initialMapVendors.join(', ')}`);

// A vendor chunk must not reach itself through its static imports (an import cycle with app
// chunks breaks the evaluation order of the vendor's modules).
for (const vendorChunk of files.filter((n) => MAP_VENDORS.some((vendor) => isVendor(n, vendor)))) {
  const via = [...importsOf(vendorChunk).staticImports].filter((name) =>
    closure([name]).has(vendorChunk),
  );
  if (via.length > 0) problems.push(`${vendorChunk} is in an import cycle via ${via.join(', ')}`);
}

const pages = files.filter((name) => /-page-[\w-]+\.js$/.test(name)).toSorted();
const rows = pages.map((page) => {
  const own = [...closure([page])].filter((name) => !initial.has(name));
  const mapVendors = MAP_VENDORS.filter((vendor) => own.some((name) => isVendor(name, vendor)));
  const pageName = page.replace(/-[\w-]{8}\.js$/, '').replace(/-[A-Za-z0-9_]+\.js$/, '');
  if (strict && mapVendors.length > 0 && !MAP_PAGES.includes(pageName))
    problems.push(`${pageName} pulls ${mapVendors.join(' + ')} but renders no map`);
  return { page: pageName, file: page, size: total(own), mapVendors };
});

console.log(
  `Initial load (${entries.join(', ')} + ${initial.size - entries.length} static chunks):`,
);
console.log(`  ${kb(initialSize.raw)} raw, ${kb(initialSize.gzip)} gzip`);
for (const name of [...initial].toSorted(
  (a, b) => (sizes.get(b)?.raw ?? 0) - (sizes.get(a)?.raw ?? 0),
))
  console.log(`    ${name.padEnd(48)} ${kb(sizes.get(name)?.raw ?? 0).padStart(10)}`);
console.log('\nLazy pages (added on top of the initial load):');
for (const row of rows.toSorted((a, b) => b.size.raw - a.size.raw))
  console.log(
    `  ${row.page.padEnd(28)} ${kb(row.size.raw).padStart(10)} raw ${kb(row.size.gzip).padStart(9)} gzip  ${row.mapVendors.join(' + ')}`,
  );
console.log('\nMap vendor chunks:');
for (const name of files.filter((n) => MAP_VENDORS.some((vendor) => isVendor(n, vendor))))
  console.log(
    `  ${name.padEnd(48)} ${kb(sizes.get(name).raw).padStart(10)} raw ${kb(sizes.get(name).gzip).padStart(9)} gzip`,
  );
const workers = readdirSync(assets).filter((name) => /worker/.test(name));
if (workers.length > 0) console.log(`  workers: ${workers.join(', ')}`);

if (problems.length > 0) {
  for (const problem of problems) console.error(`bundle: ${problem}`);
  process.exit(1);
}
console.log(`\nbundle: OK (${statSync(dist).isDirectory() ? dist : ''})`);

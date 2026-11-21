#!/usr/bin/env node
// Copies the methodology catalog (docs/references/{methods,references}.json of the central
// repository, spec §17) into public/methodology/. The web app reads the catalog from
// @darmawanweb/ais-its-contracts/references first and falls back to these files while the
// published contracts version ships an empty catalog.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, process.env.METHODOLOGY_DIR ?? '../../docs/references');
const target = resolve(root, 'public/methodology');

mkdirSync(target, { recursive: true });
let copied = 0;
for (const file of ['methods.json', 'references.json']) {
  const from = resolve(source, file);
  if (!existsSync(from)) {
    console.warn(`skipped ${file}: ${from} does not exist`);
    continue;
  }
  copyFileSync(from, resolve(target, file));
  copied += 1;
  console.info(`copied ${from} → public/methodology/${file}`);
}
if (copied === 0) console.warn('No catalog file copied: MethodInfo will show "source pending".');

#!/usr/bin/env node
// Generates the API clients of every service that already publishes openapi.json and reports
// the services that are skipped because their document does not exist yet.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENERATED_DIR, resolveApiTargets } from './api-targets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { found, skipped, dir } = resolveApiTargets();

console.info(`OpenAPI documents in ${relative(root, dir) || dir}:`);
for (const target of found)
  console.info(`  ✔ ${target.name.padEnd(14)} ${relative(root, target.spec)}`);
for (const target of skipped) {
  console.info(
    `  – ${target.name.padEnd(14)} skipped (no ${target.candidates.map((c) => relative(root, c)).join(' or ')})`,
  );
}

mkdirSync(resolve(root, GENERATED_DIR), { recursive: true });
writeFileSync(
  resolve(root, GENERATED_DIR, 'manifest.json'),
  `${JSON.stringify(
    {
      $comment: 'Written by `pnpm api:generate`. Do not edit the generated clients by hand.',
      generated: found.map((target) => target.name),
      skipped: skipped.map((target) => target.name),
    },
    null,
    2,
  )}\n`,
);

if (found.length === 0) {
  console.info('\nNo service publishes openapi.json yet: nothing to generate.');
  process.exit(0);
}

const result = spawnSync('pnpm', ['exec', 'orval', '--config', 'orval.config.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
if (result.status !== 0) process.exit(result.status ?? 1);
console.info(
  `\nGenerated ${found.length} client(s) into ${GENERATED_DIR}/; skipped ${skipped.length}.`,
);

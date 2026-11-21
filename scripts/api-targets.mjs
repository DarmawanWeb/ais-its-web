// Services whose OpenAPI documents are turned into TanStack Query clients by orval
// (docs/PLATFORM_SPEC.md §13). Each service commits `openapi.json` at its repository root;
// the ais-pipeline repository serves two processes and may publish one document per process.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {readonly { name: string; candidates: readonly string[] }[]} */
export const API_TARGETS = [
  { name: 'auth', candidates: ['auth/openapi.json'] },
  { name: 'fleet', candidates: ['fleet/openapi.json'] },
  {
    name: 'ais-pipeline',
    candidates: ['ais-pipeline/openapi.json'],
  },
  {
    name: 'ais-processor',
    candidates: ['ais-pipeline/openapi.processor.json', 'ais-pipeline/apps/processor/openapi.json'],
  },
  {
    name: 'ais-ingestor',
    candidates: ['ais-pipeline/openapi.ingestor.json', 'ais-pipeline/apps/ingestor/openapi.json'],
  },
  { name: 'telemetry', candidates: ['telemetry/openapi.json'] },
  { name: 'emission', candidates: ['emission/openapi.json'] },
  { name: 'geo', candidates: ['geo/openapi.json'] },
  { name: 'safety', candidates: ['safety/openapi.json'] },
  { name: 'surveillance', candidates: ['surveillance/openapi.json'] },
  { name: 'notification', candidates: ['notification/openapi.json'] },
];

/** Directory holding the service checkouts (central repository: ../../services). */
export function servicesDir() {
  return resolve(ROOT, process.env.OPENAPI_SERVICES_DIR ?? '../../services');
}

export const GENERATED_DIR = 'src/shared/api/generated';

/**
 * Splits the targets into those with an OpenAPI document and those still missing.
 * @returns {{ found: { name: string; spec: string }[]; skipped: { name: string; candidates: string[] }[]; dir: string }}
 */
export function resolveApiTargets() {
  const dir = servicesDir();
  const found = [];
  const skipped = [];
  for (const target of API_TARGETS) {
    const spec = target.candidates
      .map((candidate) => resolve(dir, candidate))
      .find((path) => existsSync(path));
    if (spec) found.push({ name: target.name, spec });
    else
      skipped.push({
        name: target.name,
        candidates: target.candidates.map((candidate) => resolve(dir, candidate)),
      });
  }
  return { found, skipped, dir };
}

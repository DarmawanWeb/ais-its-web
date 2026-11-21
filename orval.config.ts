import { defineConfig, type Options } from 'orval';

import { GENERATED_DIR, resolveApiTargets } from './scripts/api-targets.mjs';

/**
 * One orval project per service with a committed openapi.json (spec §5): TanStack Query v5
 * hooks + plain TypeScript types (no zod) in src/shared/api/generated/<service>/, calling the
 * API through the shared axios instance (src/shared/api/mutator.ts). Run `pnpm api:generate`.
 */
const { found } = resolveApiTargets();

const projects: Record<string, Options> = Object.fromEntries(
  found.map(({ name, spec }) => [
    name,
    {
      input: { target: spec },
      output: {
        mode: 'tags-split',
        target: `${GENERATED_DIR}/${name}/endpoints.ts`,
        schemas: `${GENERATED_DIR}/${name}/model`,
        client: 'react-query',
        httpClient: 'axios',
        clean: true,
        formatter: 'prettier',
        override: {
          mutator: { path: 'src/shared/api/mutator.ts', name: 'apiClient' },
          query: {
            signal: true,
            shouldExportKeys: true,
            shouldExportHttpClient: true,
          },
        },
      },
    } satisfies Options,
  ]),
);

export default defineConfig(projects);

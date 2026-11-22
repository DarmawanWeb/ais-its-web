import { resolve } from 'node:path';

import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

import { boundariesRule } from './eslint-boundaries.mjs';

RuleTester.describe = describe;
RuleTester.it = it;

const SRC = resolve(import.meta.dirname, '..', 'src');
const at = (path) => resolve(SRC, path);

new RuleTester({ languageOptions: { ecmaVersion: 2023, sourceType: 'module' } }).run(
  'ais/boundaries',
  boundariesRule,
  {
    valid: [
      {
        filename: at('features/map/lib/probe.ts'),
        code: "import { x } from '../components/live-vessels';",
      },
      {
        filename: at('features/map/components/sub/deep.ts'),
        code: "import { y } from '../../hooks/use-x';",
      },
      {
        filename: at('features/map/lib/probe.ts'),
        code: "import { MapView } from '@/shared/map';",
      },
      {
        filename: at('features/map/lib/probe.ts'),
        code: "import { z } from '@/features/map/lib/other';",
      },
      { filename: at('features/map/lib/probe.ts'), code: "import { io } from 'socket.io-client';" },
      { filename: at('shared/map/hooks.ts'), code: "import { a } from '../auth/session';" },
      {
        filename: at('app/router.tsx'),
        code: "import { feature } from '../features/admin/routes';",
      },
    ],
    invalid: [
      {
        filename: at('features/map/lib/probe.ts'),
        code: "import { AlertsPage } from '../../alerts/pages/alerts-page';",
        errors: [{ messageId: 'otherFeature' }],
      },
      {
        filename: at('features/map/lib/probe.ts'),
        code: "import { feature } from '../../admin/routes';",
        errors: [{ messageId: 'otherFeature' }],
      },
      {
        filename: at('features/map/lib/probe.ts'),
        code: "import { CiiPage } from '@/features/cii/pages/cii-page';",
        errors: [{ messageId: 'otherFeature' }],
      },
      {
        filename: at('features/map/lib/probe.ts'),
        code: "import { features } from '../../../app/features';",
        errors: [{ messageId: 'appShell' }],
      },
      {
        filename: at('features/map/lib/probe.ts'),
        code: "export * from '@/app/navigation';",
        errors: [{ messageId: 'appShell' }],
      },
      {
        filename: at('features/map/lib/probe.ts'),
        code: "const page = () => import('../../cii/pages/cii-page');",
        errors: [{ messageId: 'otherFeature' }],
      },
      {
        filename: at('shared/ui/button.tsx'),
        code: "import { x } from '../../features/map/lib/probe';",
        errors: [{ messageId: 'sharedToFeature' }],
      },
      {
        filename: at('shared/ui/button.tsx'),
        code: "export { features } from '@/app/features';",
        errors: [{ messageId: 'appShell' }],
      },
    ],
  },
);

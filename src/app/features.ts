import type { FeatureModule } from '@/shared/feature';
import { registerFeatureI18n } from '@/shared/i18n';

import { validateFeatures } from './navigation';

/**
 * Feature discovery: every src/features/<id>/routes.tsx exporting `feature` is mounted.
 * Adding a feature never requires editing the app shell.
 */
const modules = import.meta.glob<{ feature?: FeatureModule }>('../features/*/routes.tsx', {
  eager: true,
});

function loadFeatures(): FeatureModule[] {
  return validateFeatures(
    Object.entries(modules).map(([path, module]) => ({ path, feature: module.feature })),
  );
}

export const features: readonly FeatureModule[] = loadFeatures();

for (const feature of features) {
  if (feature.i18n) registerFeatureI18n(feature.id, feature.i18n);
}

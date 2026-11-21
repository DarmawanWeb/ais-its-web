import type { FeatureModule } from '@/shared/feature';
import { registerFeatureI18n } from '@/shared/i18n';

/**
 * Feature discovery: every src/features/<id>/routes.tsx exporting `feature` is mounted.
 * Adding a feature never requires editing the app shell.
 */
const modules = import.meta.glob<{ feature?: FeatureModule }>('../features/*/routes.tsx', {
  eager: true,
});

function loadFeatures(): FeatureModule[] {
  const list: FeatureModule[] = [];
  const ids = new Set<string>();
  for (const [path, module] of Object.entries(modules)) {
    const feature = module.feature;
    const folder = /features\/([^/]+)\/routes\.tsx$/.exec(path)?.[1];
    if (!feature) throw new Error(`${path} must export "feature" (defineFeature(...))`);
    if (feature.id !== folder) {
      throw new Error(`${path}: feature.id "${feature.id}" must equal its folder name "${folder}"`);
    }
    if (ids.has(feature.id)) throw new Error(`Duplicate feature id "${feature.id}"`);
    ids.add(feature.id);
    list.push(feature);
  }
  return list.sort((a, b) => a.id.localeCompare(b.id));
}

export const features: readonly FeatureModule[] = loadFeatures();

for (const feature of features) {
  if (feature.i18n) registerFeatureI18n(feature.id, feature.i18n);
}

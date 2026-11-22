// Local ESLint rule "ais/boundaries" (docs/FEATURE_GUIDE.md): a feature imports only its own
// folder and src/shared; shared code imports neither features nor the app shell. It resolves
// every specifier — aliases (@/…) and relative paths (../../other-feature/…) — to a file path,
// so the IDE's auto-imports cannot bypass the isolation.
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const FEATURES = resolve(SRC, 'features');
const SHARED = resolve(SRC, 'shared');
const APP = resolve(SRC, 'app');

function inside(dir, path) {
  const rel = relative(dir, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Feature folder of a path, or null outside src/features. */
function featureOf(path) {
  if (!inside(FEATURES, path)) return null;
  return relative(FEATURES, path).split(sep)[0] || null;
}

/** File path an import specifier points to; null for packages. */
function resolveSpecifier(filename, specifier) {
  if (specifier === '@' || specifier.startsWith('@/')) return resolve(SRC, specifier.slice(2));
  if (specifier === '.' || specifier === '..' || /^\.\.?\//.test(specifier)) {
    return resolve(dirname(filename), specifier);
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
export const boundariesRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Feature isolation: features import only their own folder and src/shared; shared code never imports features or the app shell.',
    },
    schema: [],
    messages: {
      otherFeature:
        'Features are isolated: "{{source}}" belongs to the feature "{{target}}". Import from "@/shared/*" (or move the code there) instead.',
      appShell:
        '"{{source}}" is part of the app shell (src/app): features and shared code must not import it.',
      sharedToFeature:
        'Shared code must not depend on features: "{{source}}" belongs to the feature "{{target}}".',
    },
  },
  create(context) {
    const filename = context.filename;
    const ownFeature = featureOf(filename);
    const inShared = inside(SHARED, filename);
    if (!ownFeature && !inShared) return {};

    function check(node) {
      const source = node?.type === 'Literal' ? node.value : null;
      if (typeof source !== 'string') return;
      const target = resolveSpecifier(filename, source);
      if (!target) return;
      if (inside(APP, target)) {
        context.report({ node, messageId: 'appShell', data: { source } });
        return;
      }
      const targetFeature = featureOf(target);
      if (!targetFeature) return;
      if (inShared) {
        context.report({
          node,
          messageId: 'sharedToFeature',
          data: { source, target: targetFeature },
        });
      } else if (targetFeature !== ownFeature) {
        context.report({
          node,
          messageId: 'otherFeature',
          data: { source, target: targetFeature },
        });
      }
    }

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
    };
  },
};

export default { meta: { name: 'ais' }, rules: { boundaries: boundariesRule } };

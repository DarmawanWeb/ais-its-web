# Feature guide — building a module of AIS Maritime Intelligence

This guide is the contract between the **app foundation** (`src/app`, `src/shared`) and the
**feature modules** (`src/features/<id>`). Follow it and three engineers can work in parallel
without touching the same files.

> Golden rule: **edit only inside your feature folder.** Everything you need from the shell,
> auth, API, realtime, map and design system is already exported from `@/shared/*`. If something
> is missing there, ask the foundation owner (or open a PR that only touches `src/shared`) —
> do not copy it into your feature and do not import another feature.

## 1. Folder layout

```
src/features/<id>/            id = folder name = i18n namespace (kebab-case)
  routes.tsx                  REQUIRED — exports `feature` (defineFeature); discovered automatically
  i18n/id.json, i18n/en.json  REQUIRED — translations of the namespace <id> (Bahasa Indonesia first)
  pages/<name>-page.tsx       one component per route, named export (e.g. `CiiPage`)
  components/                 feature components (PascalCase exports, kebab-case files)
  api/                        hand-written query/mutation hooks wrapping generated clients
  hooks/                      feature hooks (state, derived data, realtime wiring)
  lib/                        pure helpers (formatters, mappers) — unit tested
  **/*.test.ts(x)             unit/component tests next to the code
```

The stubs already exist for every planned module: `dashboard`, `map`, `alerts`, `safety`
(EWS, collision), `surveillance` (transhipment, fishing, dark, anomaly), `vessels`, `cii`,
`seemp`, `telemetry`, `zones`, `alert-rules`, `admin` (organizations, members, api-keys,
reference-data, devices, audit-log), `profile`, `methodology`. `auth` is implemented by the
foundation. Replace the placeholder pages (`PlaceholderPage`) with the real ones.

### Suggested ownership (three engineers)

| Engineer                | Features                                                                         |
| ----------------------- | -------------------------------------------------------------------------------- |
| A — Operations & safety | `map`, `alerts` (incl. the top bar bell slot), `safety`, `surveillance`, `zones` |
| B — Fleet & emissions   | `dashboard`, `vessels`, `cii`, `seemp`, `telemetry`, `methodology`               |
| C — Settings & identity | `admin`, `alert-rules`, `profile`                                                |

## 2. `routes.tsx` contract

```tsx
import { Leaf } from 'lucide-react';

import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

export const feature = defineFeature({
  id: 'cii', // must equal the folder name
  i18n: { id, en }, // registered as namespace "cii"
  routes: [
    // mounted inside the authenticated shell
    {
      path: 'cii', // relative to "/" (→ /cii)
      handle: { titleKey: 'cii:cii.title', permission: 'cii:read' },
      lazy: lazyPage(() => import('./pages/cii-page'), 'CiiPage'), // code-split page
    },
    {
      path: 'cii/:mmsi',
      handle: { titleKey: 'cii:detail.title', permission: 'cii:read' },
      lazy: lazyPage(() => import('./pages/cii-detail-page'), 'CiiDetailPage'),
    },
  ],
  nav: [
    // sidebar entries (sorted by section, order)
    {
      id: 'cii.cii',
      section: 'fleet', // operations | safety | surveillance | fleet | settings | knowledge
      order: 30, // 10, 20, 30… leave gaps for new items
      path: '/cii',
      labelKey: 'cii:nav.cii',
      icon: Leaf, // lucide-react icon
      permission: 'cii:read', // hidden when missing (array = any of)
      keywords: ['cii', 'emisi', 'co2'], // command palette search
    },
  ],
  commands: [], // optional extra command palette actions
  slots: {}, // optional shell slots (see §8)
});
```

- **Route handle** (`AppRouteHandle`): `titleKey` (document title + breadcrumb), `permission`
  (the shell renders 403 when missing — every matched route is checked), `layout: 'full-bleed'`
  (no shell padding; used by map pages).
- Pages are **named exports** loaded with `lazyPage()`; never import pages eagerly in
  `routes.tsx` (it is part of the main bundle).
- `publicRoutes` are only for pages outside the shell without authentication (auth uses it).
- Route data: prefer TanStack Query in components; if you add a route `loader`, it must not
  fetch tenant data before the permission check (use queries instead).
- Contract used by other modules: **vessel detail lives at `/vessels/:mmsi`** (the command
  palette and the live map link there).

## 3. Translations

- UI default is **Bahasa Indonesia**; English must have the same keys.
- Use your namespace: `const { t } = useTranslation('cii'); t('cii.title')`. Keys of other
  namespaces: `t('common:actions.save')`, `t('common:nav.sections.fleet')`.
- Shared strings (actions, errors, table, units, map, method popover) live in the `common`
  namespace (`src/shared/i18n/locales/*/common.json`, foundation-owned). Do not add feature
  strings there.
- Domain labels come from contracts, never hard-coded: `NAV_STATUS_LABELS`, `EWS_STATUS_LABELS`,
  `COLLISION_RISK_LABELS`, `ALERT_SEVERITY_LABELS`, `alertTypeLabel()`, `ZONE_KIND_LABELS`,
  `ROLE_LABELS`, `CII_GRADE_LABELS` (or the domain components that wrap them).
- Numbers/dates: `formatNumber`, `formatDateTime`, `formatRelativeTime` (`@/shared/lib/format`),
  `<UnitValue unit="knots" />`, `<CoordinateText />`, `<MmsiText />`.

## 4. Data: generated clients, queries, errors

1. Run `pnpm api:generate` after a service commits/updates its `openapi.json`. It writes
   `src/shared/api/generated/<service>/` (orval, TanStack Query v5 hooks + TS types) and prints
   the services it skipped. Generated code is committed and **never edited by hand**.
   Services without a document are skipped and their previous output is left untouched.
2. Use generated hooks directly or wrap them in `src/features/<id>/api/*.ts`:

   Files are split per OpenAPI tag and hooks are named after the `operationId`
   (e.g. `VesselsController_list` → `useVesselsControllerList`):

   ```ts
   import {
     useListVessels,
     getListVesselsQueryKey,
   } from '@/shared/api/generated/fleet/vessels/vessels';
   const vessels = useListVessels({ search, page, pageSize });
   await queryClient.invalidateQueries({ queryKey: getListVesselsQueryKey() });
   ```

   Every generated call goes through the shared axios instance (`src/shared/api/mutator.ts`):
   bearer token, `X-Request-Id`, refresh-on-401 with one retry, and errors as `ApiProblem`.

3. Until a service publishes its document, call `http` (`@/shared/api/http`) from your
   `api/` folder with the spec's paths (`/api/v2/...`), and switch to the generated hook later.
4. Hand-written query keys: `serviceKeys('fleet').resource('vessels').list(params)` →
   `['fleet', 'vessels', 'list', params]` (`@/shared/api/query-keys`).
5. Errors: `query.error` is an `ApiProblem` (RFC 9457: `status`, `code`, `title`, `detail`,
   `errors[]`, `traceId`, `retryAfterSeconds`). Render with `<ErrorState error={query.error}
onRetry={query.refetch} />`; map form errors with `problem.fieldErrors()` →
   `form.setError(field, { message })`. 4xx are never retried.
6. Lists: page-based (`{ data, meta }`) → `usePageState()`; cursor-based
   (`{ data, page: { nextCursor } }`) → `useCursorState()`; both plug into `<DataTable
pagination={…} />` (see `src/shared/domain-ui/data-table`). CSV export: `downloadCsv()`
   (`@/shared/lib/csv`).
7. Tenancy: the cache is cleared on logout and reset when the active organization changes —
   do not keep tenant data in Zustand/localStorage.

## 5. Permissions

- Route level: `handle.permission` (403 page by the shell).
- Element level: `<Can permission="vessel:write"><Button…/></Can>`; in code
  `usePermission('alert:ack')` (a list means "any of"); super_admin has every permission.
- Section level: `<RequirePermission permission="seemp:simulate" fallback={null}>`.
- Tenant-private records (spec §8.5): `useCanAccessOrg(record.orgId)`.
- Session: `useSession()` → `{ userId, orgId, roles, email, name, isPlatformAdmin, memberships }`.
  Never read the token yourself (it is in memory only, `getAccessToken()` is for infrastructure).

## 6. Map

Integration: **MapLibre GL + `@deck.gl/mapbox` `MapboxOverlay` (overlaid, `interleaved: false`)**,
wrapped by `<MapView>` (`@/shared/map`). deck.gl layers survive basemap switches; MapLibre
sources/layers are re-added automatically after a switch.

```tsx
import { MapPageLayout, MapView, useDeckLayers, useMapLibreLayers, useMapViewport,
  VesselLayer, VesselSafetyLegend } from '@/shared/map';
import { useViewportPositions } from '@/shared/realtime';

function ZonesLayer({ data }: { data: FeatureCollection }) {
  const layers = useMemo(() => [new GeoJsonLayer({ id: 'zones', data, pickable: true,
    getFillColor: [56, 189, 248, 40], getLineColor: [56, 189, 248, 200] })], [data]);
  useDeckLayers('zones', layers, { order: 10, getTooltip: (info) => info.object?.properties?.name ?? null });
  return null;
}

function Live() {                       // must be rendered INSIDE <MapView>
  const viewport = useMapViewport();    // { bbox, zoom, center } debounced on moveend
  const { vessels } = useViewportPositions(viewport.bbox, viewport.zoom);
  return <VesselLayer vessels={vessels} onSelect={(v) => …} />;
}

export function EwsPage() {
  return (
    <MapPageLayout                       // route handle: { layout: 'full-bleed' }
      map={<MapView><ZonesLayer data={…} /><Live /></MapView>}
      bottomLeft={<VesselSafetyLegend />}
      sidePanel={…} sidePanelOpen={…} onSidePanelOpenChange={…}
    />
  );
}
```

- Layer order (`order`): heatmaps 5, zones 10, tracks/encounters 50, vessels 100 (higher on top).
- Create deck layers in `useMemo`; pass a new `data` to update. Use deck `TextLayer` for labels
  (raster basemaps have no glyphs). MapLibre GeoJSON: `useMapLibreLayers(id, source, layers)`.
- Components that need the map (`useMapViewport`, `useDeckLayers`, `useMapEvent`) must be
  children of `<MapView>`; floating panels outside it use `MapPageLayout` slots (`topLeft`,
  `topCenter`, `bottomLeft`, `sidePanel`) or `<MapPanel>`.
- Vessel icons: `vesselIconName(typeCode)` maps fleet type codes to the legacy icons
  (`public/ships/*.png`); rotation uses heading, else COG; ring colours by safety state.
- Drawing zones: `terra-draw` + `terra-draw-maplibre-gl-adapter` with `useMapContext().map`.
- Attributions are always visible (MapLibre attribution control is non-compact). Wherever you
  show weather-derived values add `<DataAttribution provider="open-meteo" />`.
- Basemap: user choice (persisted); dark vector when `VITE_MAP_STYLE_URL` is set, OSM raster
  fallback, Esri satellite. Default centre Batam (1.143238, 103.856406).

## 7. Realtime

`@/shared/realtime` (socket.io client of spec §9, started by the app, reconnects with fresh tokens):

| Hook                                        | Use                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `useRealtimeConnection()`                   | `{ status, connected, error }`                                           |
| `useViewportPositions(bbox, zoom)`          | joins tile rooms, seeds from REST, returns throttled vessels in the bbox |
| `useVesselSnapshot({ bbox?, throttleMs? })` | the live store without changing the viewport                             |
| `useVesselLive(mmsi)`                       | joins `vessel:<mmsi>`; latest position + safety state of one vessel      |
| `useAlertStream((alert, kind) => …)`        | `alert:raised` / `alert:updated`                                         |
| `useCiiUpdates((update) => …)`              | `cii:updated` of the active organization                                 |

Records merge position and safety state per MMSI, ignore out-of-order messages and are pruned
after 30 minutes without data. Invalidate queries from the stream handlers (e.g. the alert
list) instead of keeping a second copy of server state.

## 8. Shell slots and the command palette

- `slots: { 'topbar.alerts': AlertsBell }` replaces the placeholder bell (alerts feature);
  `'topbar.actions'` adds a top bar control; `'sidebar.footer'` a block above the sidebar footer.
- `commands: [{ id, labelKey, icon, permission, perform: ({ navigate }) => … }]` adds palette
  actions. Nav entries appear in the palette automatically; vessel search calls
  `GET /api/v2/vessels?search=` and opens `/vessels/:mmsi`.

## 9. UI building blocks

- Primitives (`@/shared/ui/*`, shadcn/ui on Radix): button, input, textarea, label, select,
  checkbox, switch, radio-group, dialog, alert-dialog, sheet, drawer (vaul), dropdown-menu,
  popover, tooltip, tabs, table, badge, card, skeleton, separator, scroll-area, sonner toasts
  (`toast`), command (cmdk), form (react-hook-form + zod 4 via `@hookform/resolvers/zod`),
  alert, avatar, pagination, calendar, date-range-picker (`toIsoRange()`), progress,
  toggle-group, collapsible, kbd, spinner.
- Domain components (`@/shared/domain-ui`): `PageHeader`, `Section`, `StatCard`, `KeyValueList`,
  `DataTable` (+ `DataTableColumnHeader`, `usePageState`, `useCursorState`), `EmptyState`,
  `ErrorState`, `ForbiddenState`, `ConfirmDialog`, `CiiGradeBadge`, `EwsStatusBadge`,
  `CollisionRiskBadge`, `SeverityBadge`, `NavstatusLabel`, `MmsiText`, `CoordinateText`,
  `UnitValue`, `MethodInfo`, `DataAttribution`, `PlaceholderPage`.
- **Methodology (spec §17)**: put `<MethodInfo methodId="cii.attained_accumulation" />` next to every
  computed figure (CII attained/required/rating/grade, SEEMP recommendation, EWS status,
  CPA/TCPA, transhipment score, fuel method). Ids come from `docs/references/methods.json`;
  API responses carry `methodIds` / `methodId`.
- Styling: Tailwind utilities on the tokens (`bg-surface`, `bg-elevated`, `text-muted-foreground`,
  `border-border`, `text-primary`, `bg-success|warning|danger|info`, `bg-grade-a…e`,
  `chart-1…8`, `font-mono` for MMSI/coordinates/numbers). No hard-coded hex colours except in
  deck.gl layers (use `SAFETY_COLORS`, `CII_GRADE_COLORS` from `@/shared/theme/tokens`).
  Charts: recharts with `var(--chart-n)` colours. Both themes must look right.
- Accessibility: one `<h1>` per page (`PageHeader`), labelled icon buttons, keyboard reachable
  rows (`DataTable onRowClick`), `jsx-a11y` lint rules are errors.

## 10. Tests

- Unit/component tests: `*.test.ts(x)` next to the code, run by `pnpm test` (vitest + jsdom).
- Helpers (`@/test/*`): `renderApp({ route, session: { roles, org } })` renders the real app
  router with a signed-in user (`session: null` = anonymous); `renderWithProviders(ui)` for a
  single component; `server.use(http.get('*/api/v2/...', () => HttpResponse.json(…)))` (MSW 2)
  to mock your endpoints — unknown `/api/v2/*` requests answer 404 problem details;
  `makeAccessToken()` builds test tokens.
- Do not render `<MapView>` in jsdom (no WebGL): test layer factories and hooks' pure logic,
  and cover map pages in Playwright.
- E2E: `pnpm test:e2e` (Playwright against `vite preview` + the mock gateway in
  `e2e/mock-server/server.mjs`). Add endpoints you need to the mock in the same PR.

## 11. Files you must NOT touch

`src/app/**`, `src/shared/**` (incl. `src/shared/api/generated/**` — regenerate instead),
`src/styles/**`, `src/test/**` (except adding fixtures in your PR with the foundation owner),
`src/main.tsx`, `index.html`, `package.json`, `pnpm-lock.yaml`, `vite.config.ts`,
`tsconfig*.json`, `eslint.config.js`, `.prettierrc`, `orval.config.ts`, `scripts/**`,
`playwright.config.ts`, `Dockerfile`, `docker/**`, `.github/**`. Every dependency you plausibly
need is installed (deck.gl incl. aggregation/geo layers, terra-draw, recharts, react-table,
react-virtual, papaparse, react-dropzone, qrcode, katex, turf, date-fns, cmdk, vaul…).

ESLint enforces the isolation: a feature cannot import `@/features/*` or `@/app/*`.

## 12. Definition of done

- [ ] Placeholder replaced; loading (skeleton), empty, error (`ErrorState`) and 403 states handled.
- [ ] Permissions on routes, nav entries and actions; tenant rules respected.
- [ ] id + en translations, contracts labels for domain values, units via `UnitValue`.
- [ ] `MethodInfo` next to computed figures; `DataAttribution` for weather data.
- [ ] Works in dark and light themes, at 390 px width, with keyboard only.
- [ ] Tests for lib/hooks/components; Playwright happy path when the page has a key flow.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass.

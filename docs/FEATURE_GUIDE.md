# Feature guide — building a module of AIS Maritime Intelligence

This guide is the contract between the **app foundation** (`src/app`, `src/shared`, the e2e
harness) and the **feature modules** (`src/features/<id>`). Follow it and several engineers can
work in parallel without touching the same files.

> Golden rule: **edit only inside your feature folder** (plus your own e2e spec and mock route
> file, §10). Everything you need from the shell, auth, API, realtime, map and design system is
> already exported from `@/shared/*`. If something is missing there, ask the foundation owner
> (or open a PR that only touches `src/shared`) — do not copy it into your feature and do not
> import another feature.

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
e2e/<id>.spec.ts              Playwright spec of the feature (picked up automatically)
e2e/mock-server/routes/<id>.mjs   mock endpoints of the feature (loaded automatically)
```

Adding a new feature module is exactly that: a new folder with a `routes.tsx` — no shell, router
or navigation file changes. At start-up `src/app/features.ts` validates every module (folder =
`id`, unique ids, single owner of single-owner slots) and fails loudly otherwise.

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

import { CiiTopbarBadge } from './components/cii-topbar-badge';
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
  slots: { 'topbar.actions': { component: CiiTopbarBadge, order: 30 } }, // optional (§8)
});
```

- **Route handle** (`AppRouteHandle`): `titleKey` (document title + breadcrumb), `permission`
  (the shell renders 403 when missing — every matched route is checked), `layout: 'full-bleed'`
  (no shell padding; used by map pages).
- Pages are **named exports** loaded with `lazyPage()`; never import pages eagerly in
  `routes.tsx` (it is part of the main bundle). Components used by `slots` are imported eagerly:
  keep them small.
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

1. Every service publishes its `openapi.json`, and `pnpm api:generate` writes
   `src/shared/api/generated/<service>/` (orval, TanStack Query v5 hooks + TS types) for
   `auth`, `fleet`, `ais-processor`, `ais-ingestor`, `telemetry`, `emission`, `geo`, `safety`,
   `surveillance` and `notification` (`generated/manifest.json` lists them and any skipped
   service). Re-run it when a service changes its document. Generated code is committed and
   **never edited by hand**.
2. Use generated hooks directly or wrap them in `src/features/<id>/api/*.ts`. Files are split
   per OpenAPI tag and hooks are named after the `operationId`
   (`VesselsController_list` → `useVesselsControllerList`):

   ```ts
   import {
     getVesselsControllerListQueryKey,
     useVesselsControllerList,
   } from '@/shared/api/generated/fleet/vessels/vessels';
   import type { VesselSummaryDto } from '@/shared/api/generated/fleet/model';

   const vessels = useVesselsControllerList({ search, page, pageSize });
   await queryClient.invalidateQueries({ queryKey: getVesselsControllerListQueryKey() });
   ```

   Options go through `{ query: { … } }` (e.g. `useStatsControllerDescribe({ query: {
refetchInterval: 30_000 } })`, see `src/features/dashboard`). Every generated call goes
   through the shared axios instance (`src/shared/api/mutator.ts`): bearer token,
   `X-Request-Id`, refresh-on-401 with one retry, and errors as `ApiProblem`.

3. Only for an endpoint that is missing from a document, call `http` (`@/shared/api/http`) from
   your `api/` folder with the spec's path (`/api/v2/...`) and validate the response with zod.
   Never call the session endpoints (`/auth/login|refresh|logout|switch-org`) yourself: use
   `@/shared/auth` (`login`, `logout`, `switchOrganization`, `useSession`).
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
7. Tenancy: the cache is cleared on logout and reset when the user, the active organization or
   the roles change — do not keep tenant data in Zustand/localStorage.

## 5. Permissions and session

- Route level: `handle.permission` (403 page by the shell).
- Element level: `<Can permission="vessel:write"><Button…/></Can>`; in code
  `usePermission('alert:ack')` (a list means "any of"); super_admin has every permission.
- Section level: `<RequirePermission permission="seemp:simulate" fallback={null}>`.
- Tenant-private records (spec §8.5): `useCanAccessOrg(record.orgId)`.
- Session: `useSession()` → `{ userId, orgId, roles, email, name, isPlatformAdmin, memberships }`.
  Never read the token yourself (it is in memory only, `getAccessToken()` is for infrastructure).
- Sign-out: `logout()` ends the local session at once in every tab and resolves to
  `{ revoked }` once `POST /auth/logout` succeeded or failed. A failed revocation is handled by
  the foundation (toast with retry, background retries, no session restore from the cookie):
  features only navigate to the login page.

## 6. Map

Integration: **MapLibre GL + `@deck.gl/mapbox` `MapboxOverlay` (overlaid, `interleaved: false`)**,
wrapped by `<MapView>` (`@/shared/map`). deck.gl layers survive basemap switches; MapLibre
sources/layers are re-added automatically after a switch. MapLibre's web worker is registered
by the foundation (`src/shared/map/maplibre-setup.ts`), so GeoJSON sources, vector basemaps and
Martin tiles (`/tiles`, the token is added by `transformRequest`) work out of the box.

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

function PipelinesLayer({ data }: { data: FeatureCollection }) {   // MapLibre (worker-parsed)
  useMapLibreLayers('pipelines', { type: 'geojson', data }, [
    { id: 'pipelines-line', type: 'line', source: 'pipelines', paint: { 'line-color': '#f59e0b', 'line-width': 2 } },
  ]);
  return null;
}

function Live() {                       // must be rendered INSIDE <MapView>
  const viewport = useMapViewport();    // { bbox, zoom, center } debounced on moveend
  const { vessels } = useViewportPositions(viewport.bbox, viewport.zoom);
  return <VesselLayer vessels={vessels} onSelect={(v) => …} />;
}

export function EwsPage() {
  const { t } = useTranslation('safety');
  return (
    <MapPageLayout                       // route handle: { layout: 'full-bleed' }
      title={t('ews.title')}             // REQUIRED: the page's (visually hidden) h1
      map={<MapView><ZonesLayer data={…} /><PipelinesLayer data={…} /><Live /></MapView>}
      bottomLeft={<VesselSafetyLegend />}
      sidePanel={…} sidePanelOpen={…} onSidePanelOpenChange={…}
    />
  );
}
```

- Layer order (`order`): heatmaps 5, zones 10, tracks/encounters 50, vessels 100 (higher on top).
- Create deck layers in `useMemo`; pass a new `data` to update. Use deck `TextLayer` for labels
  (raster basemaps have no glyphs). MapLibre GeoJSON: `useMapLibreLayers(id, source, layers)`
  (the source id is the registration `id`).
- Components that need the map (`useMapViewport`, `useDeckLayers`, `useMapEvent`) must be
  children of `<MapView>`; floating panels outside it use `MapPageLayout` slots (`topLeft`,
  `topCenter`, `bottomLeft`, `sidePanel`) or `<MapPanel>`.
- Vessel icons: `vesselIconName(typeCode)` maps fleet type codes to the legacy icons
  (`public/ships/*.png`); rotation uses heading, else COG. **Safety rings** use colour and line
  style (`SAFETY_COLORS`, `SAFETY_RING_STYLES` in `@/shared/theme/tokens`): EWS danger red and
  collision high magenta (solid, 3 px), EWS warning amber (solid, 2 px), collision medium pink
  (dashed); the selected vessel gets a separate cyan halo and keeps its ring. Reuse
  `safetyRingKind()` / `VesselSafetyLegend` (legend shapes `ring` and `ring-dashed`) instead of
  new colours, and never encode a state by colour alone.
- Drawing zones: `terra-draw` + `terra-draw-maplibre-gl-adapter` with `useMapContext().map`.
- Attributions are always visible (MapLibre attribution control is non-compact). Wherever you
  show weather-derived values add `<DataAttribution provider="open-meteo" />`.
- Basemap: user choice (persisted); dark vector when `VITE_MAP_STYLE_URL` is set, OSM raster
  fallback, Esri satellite. Default centre Batam (1.143238, 103.856406).
- E2E: the Playwright build exposes the live maps as `window.__AIS_E2E_MAPS__` (MapLibre `Map`
  instances, newest last) to assert MapLibre layers with `queryRenderedFeatures`
  (`e2e/map.spec.ts`); deck.gl layers are asserted through the UI (counts, panels).

## 7. Realtime

`@/shared/realtime` (socket.io client of spec §9, started by the app):

| Hook                                        | Use                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `useRealtimeConnection()`                   | `{ status, connected, error }`                                           |
| `useViewportPositions(bbox, zoom)`          | joins tile rooms, seeds from REST, returns throttled vessels in the bbox |
| `useVesselSnapshot({ bbox?, throttleMs? })` | the live store of this tab (vessels of map views and subscriptions)      |
| `useVesselLive(mmsi)`                       | joins `vessel:<mmsi>`; latest position + safety state of one vessel      |
| `useAlertStream((alert, kind) => …)`        | `alert:raised` / `alert:updated`                                         |
| `useCiiUpdates((update) => …)`              | `cii:updated` of the active organization                                 |

Records merge position and safety state per MMSI, ignore out-of-order messages and are pruned
after 30 minutes without data. The store only holds what this tab subscribed to: for platform
counts use the REST API (e.g. `GET /ais/stats` `activeVessels`). Invalidate queries from the
stream handlers (e.g. `useAlertStream(() => invalidateQueries({ queryKey:
getAlertsControllerSummaryQueryKey() }))`) instead of keeping a second copy of server state.
Reconnection is the foundation's job: fresh tokens on every handshake, retries with backoff
after rejected handshakes and server disconnects, re-handshake on user/org/role changes, and
viewport/vessel subscriptions replayed after every reconnect.

## 8. Shell slots and the command palette

| Slot             | Owners                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `topbar.alerts`  | single owner — the `alerts` feature replaces the placeholder bell; a second feature claiming it fails at start-up                       |
| `topbar.actions` | any number of features: `{ component, order }` (or a list of them), rendered left of the bell by `order` (default 100), then feature id |
| `sidebar.footer` | same as `topbar.actions`, rendered above the desktop sidebar footer                                                                     |

```ts
slots: {
  'topbar.alerts': AlertsBell,                                   // alerts feature only
  'topbar.actions': [{ component: AlertStreamListener, order: 10 }, { component: Quick, order: 20 }],
}
```

A slot component renders in every page of the shell: keep it light (no heavy queries; render
`null` for background listeners).

- `commands: [{ id, labelKey, icon, permission, perform: ({ navigate }) => … }]` adds palette
  actions. Nav entries appear in the palette automatically; vessel search calls
  `GET /api/v2/vessels?search=` and opens `/vessels/:mmsi`. After a selection the palette moves
  focus to the content area (`#main-content`).

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
  API responses carry `methodIds` / `methodId`. `<Formula latex>` scrolls inside its box (never
  widens the page) and becomes keyboard focusable when it scrolls.
- Styling: Tailwind utilities on the tokens (`bg-surface`, `bg-elevated`, `text-muted-foreground`,
  `border-border`, `text-primary`, `bg-success|warning|danger|info`, `bg-grade-a…e`,
  `chart-1…8`, `font-mono` for MMSI/coordinates/numbers). The semantic colours meet WCAG AA as
  text in both themes (on the background, surfaces and their own `/15` tint, and white text on
  the solid fill), so `text-warning`, `<Badge variant="warning">` and `<Alert variant>` are
  safe; do not lighten them with opacity (`text-warning/60`) for text. No hard-coded hex colours
  except in deck.gl layers (use `SAFETY_COLORS`, `CII_GRADE_COLORS` from
  `@/shared/theme/tokens`). Charts: recharts with `var(--chart-n)` colours. Both themes must
  look right.
- Layout: grid and flex children that hold wide content (tables, code, formulas) need `min-w-0`
  (or `grid-cols-[minmax(0,1fr)]`); wide content scrolls in its own box (`overflow-x-auto`),
  never the page.
- Accessibility: exactly one `<h1>` per page (`PageHeader`, or `MapPageLayout` `title` on map
  pages), then `h2` for sections without skipping levels; labelled icon buttons; when a control
  has visible text its accessible name must contain that text (no `aria-label` that drops it —
  use `sr-only` text instead); keyboard reachable rows (`DataTable onRowClick`); `jsx-a11y` lint
  rules are errors and axe runs in e2e.

## 10. Tests

- Unit/component tests: `*.test.ts(x)` next to the code, run by `pnpm test` (vitest + jsdom).
- Helpers (`@/test/*`): `renderApp({ route, session: { roles, org } })` renders the real app
  router with a signed-in user (`session: null` = anonymous); `renderWithProviders(ui)` for a
  single component; `server.use(http.get('*/api/v2/...', () => HttpResponse.json(…)))` (MSW 2)
  to mock your endpoints — unknown `/api/v2/*` requests answer 404 problem details;
  `makeAccessToken()` builds test tokens. Type MSW fixtures with the generated DTOs
  (`satisfies VesselDetailDto`) so contract changes fail the typecheck.
- Do not render `<MapView>` in jsdom (no WebGL): test layer factories (`createVesselLayers`
  style) and hooks' pure logic, and cover map pages in Playwright.
- **E2E** (`pnpm test:e2e`; CI runs it): every `e2e/**/*.spec.ts` except
  `screenshots.spec.ts`, against the production build (`vite preview`) and the mock gateway.
  - Add `e2e/<feature>.spec.ts`; use `login(page, USERS.manager)`, `axeViolations(page)` and
    `navigationPaths(page)` from `e2e/fixtures.ts`.
  - Mock endpoints go in **`e2e/mock-server/routes/<feature>.mjs`** (one file per feature,
    loaded automatically — see `e2e/mock-server/routes/README.md`); shapes follow the
    service's `openapi.json`. Use `page.route()` for failures and delays of a single test.
  - Automatic checks of every sidebar page: axe WCAG 2.1 A/AA in the dark and the light theme
    (`e2e/a11y.spec.ts`), exactly one h1 and no horizontal page scroll at 1280 and 390 px
    (`e2e/layout.spec.ts`). A page is covered as soon as it has a nav entry; pages without one
    (details, dialogs) need a check in your spec.
- Screenshots (`pnpm screenshots`, foundation-owned) refresh `docs/screenshots/*.png`.

## 11. Files you must NOT touch

`src/app/**`, `src/shared/**` (incl. `src/shared/api/generated/**` — regenerate instead),
`src/styles/**`, `src/test/**` (except adding fixtures in your PR with the foundation owner),
`src/main.tsx`, `index.html`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
`vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc`, `orval.config.ts`,
`scripts/**`, `playwright.config.ts`, `e2e/fixtures.ts`, `e2e/smoke.spec.ts`,
`e2e/a11y.spec.ts`, `e2e/layout.spec.ts`, `e2e/map.spec.ts`, `e2e/session.spec.ts`,
`e2e/screenshots.spec.ts`, `e2e/mock-server/server.mjs`, `e2e/mock-server/lib.mjs`,
`Dockerfile`, `docker/**`, `.github/**`. Every dependency you plausibly need is installed
(deck.gl incl. aggregation/geo layers, terra-draw, recharts, react-table, react-virtual,
papaparse, react-dropzone, qrcode, katex, turf, date-fns, cmdk, vaul…).

ESLint enforces the isolation with the local rule `ais/boundaries`
(`scripts/eslint-boundaries.mjs`): a feature imports only its own folder and `@/shared/*` —
aliases (`@/features/other/…`, `@/app/…`) and relative paths (`../../other/…`, `../../../app/…`)
alike — and shared code never imports features or the app shell.

## 12. Definition of done

- [ ] Placeholder replaced; loading (skeleton), empty, error (`ErrorState`) and 403 states handled.
- [ ] Permissions on routes, nav entries and actions; tenant rules respected.
- [ ] id + en translations, contracts labels for domain values, units via `UnitValue`.
- [ ] `MethodInfo` next to computed figures; `DataAttribution` for weather data.
- [ ] Works in dark and light themes, at 390 px width (no page scroll), with keyboard only; one h1.
- [ ] Tests for lib/hooks/components; `e2e/<feature>.spec.ts` for the key flow, mock routes in
      `e2e/mock-server/routes/<feature>.mjs`.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` pass
      (incl. axe in both themes).

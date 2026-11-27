# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Every feature module of the first release (see the README feature table): live map, alerts
  and the top bar bell, pipeline EWS, collision risk, surveillance overview / transhipment /
  fishing / dark vessels / navstatus anomalies, zones and the zone editor, dashboard, vessels,
  CII, SEEMP, telemetry, alert rules, administration (organizations, members, API keys,
  reference data, devices, audit log), profile and methodology — with component tests, e2e
  specs and mock gateway modules per feature.
- Role walkthrough `e2e/roles.spec.ts`: super_admin, org_admin, fleet_manager, authority and
  viewer open every sidebar entry and the command palette; no 403, no action the role cannot
  perform, no console error, failed API call or missing translation. Mock accounts
  `orgadmin@pelni.test`, `petugas@ksop-batam.test`, `viewer@pelni.test` (`ROLE_USERS`).
- Quality gates: `pnpm i18n:check` (also in `pnpm test`), `pnpm bundle:report`,
  `pnpm perf:map` (10 000 vessels); development and e2e builds warn on i18n keys that exist in
  no language.
- Shared building blocks promoted from the features: `@/shared/api/problem-copy`
  (`localizeProblem`, `problemSummary`, `problemMessage`, `applyFieldErrors`),
  `useAppLanguage`, `CopyButton`, `MethodChips`, `useMethodName`, `gradeClassName`, `useNow`,
  `nowMs` / `currentYear`, `MAP_FONT`, and `NavItem.end` for section overviews.
- `docs/SCREENSHOTS.md`: gallery of every page by menu section (dark, light, phone).
- Pages use the aggregate endpoints of the services' 0.2 releases instead of browser-side
  workarounds: dashboard `GET /ais/stats/series` (6-hour AIS rate history instead of samples
  taken while the page is open), `GET /alerts/stats/series` (7 local days, no 500-alert cap),
  `GET /safety/stats` (no 5 000-state list), `GET /cii/fleet/fuel` (one request instead of one
  per vessel, no 50-vessel cap); telemetry `readings.csv` (streamed export instead of 40 pages),
  `order=desc` for the newest readings of a vessel, `GET /telemetry/vessels/:mmsi/devices`
  (fleet managers see the vessel's devices read-only); administration: audit names captured by
  auth (`actorName`, `actorEmail`, `orgName`, `targetLabel`), action suggestions
  (`GET /audit-logs/actions`) and the streamed `GET /audit-logs.csv`, per-kind organization
  counts (`GET /organizations/stats`) with member and API key counts per row, invitation resend
  (`POST …/invitations/:id/resend`), API key status, expiry and rotation with a grace period
  (`POST /api-keys/:id/rotate`, the new secret shown once), devices with the server's
  `connectionState`, `vesselName` and broker details (`GET /telemetry/devices/:id/connection`);
  alerts: the streamed `GET /alerts/export.csv` (every matching alert, headers in the UI language,
  `X-Truncated` reported) instead of paging 5 000 alerts in the browser, and the occurrence
  history of an alert (`GET /alerts/:id/occurrences`: raised, escalated, merged with their
  severity) in the detail timeline; vessels: "last seen" of the fleet list in one
  `GET /ais/latest?mmsi=…` per 100 vessels instead of one request per row; surveillance overview:
  one `GET /surveillance/stats/series` (local hours or days) instead of one `GET /stats` per
  bucket; alert rules: delivery success rate and last delivery from
  `GET /notifications/deliveries/summary` (30 days) instead of the latest 50 deliveries.
- Shared: `downloadServerFile` / `saveTextFile` / `attachmentFilename` (`@/shared/api/download`,
  service CSV exports through the axios instance), `@/shared/lib/fuel-formula` (the contracts
  0.4 grammar with translatable issue codes), `CopyText` (`@/shared/ui/copy-text`),
  `YearSelect` (`@/shared/domain-ui/year-select`), `CiiGradeBadge size="xl"`,
  `useEmissionFormat` (`@/shared/hooks/use-emission-format`), `problemResponse`
  (`@/test/msw/problem`); the mock gateway's `send` passes a string body with a `Content-Type`
  through (CSV routes).

### Added (foundation, before the features)

- E2E mock gateway for parallel feature work: modules `routes/<feature>.mjs` (named after the
  feature, checked at start-up) export `routes` (paths with `:param` segments, literal segments
  win, optional `permission`), `realtime` hooks and `reset`; foundation defaults moved to
  `e2e/mock-server/base/*.mjs` (incl. `GET /me` and `/organizations`), which a feature route
  with the same method and path replaces. Helpers `pageOf` / `cursorPageOf` (spec §5), `can`
  (contracts role matrix), `MockHttpError`.
- Mock realtime server (`e2e/mock-server/realtime.mjs`, socket.io dev dependency): the spec §9
  handshake, rooms, `viewport:set` / `vessel:subscribe` acknowledgements and latest-state
  snapshots, with a validated push API (`positions`, `safety:states`, alerts, `cii:updated`).
  Test controls `/__mock/realtime` and `/__mock/reset` behind `pushRealtime`,
  `waitForRealtimeRoom`, `realtimeConnections`, `expectRealtimeConnected` and
  `resetMockGateway` (`e2e/fixtures.ts`); `e2e/realtime.spec.ts` covers the protocol and the
  live map; `MOCK_REALTIME_SIMULATE=true` moves the demo vessels for development.
- Base mock data follows the DTOs (`VesselSummaryDto`, `SafetyVesselStateDto`) and adds
  `GET /ais/vessels/:mmsi/latest` and `GET /safety/vessels/:mmsi` (the realtime vessel seed).

### Changed

- API clients regenerated again (auth 0.2, safety `GET /safety/stats`, telemetry device fields,
  fleet `POST /fuel-formulas/validate`); `pnpm api:generate` shows no drift against the current
  documents.
- Problem details of text responses (CSV downloads) are parsed, so their codes reach
  `ApiProblem`.
- API clients regenerated from the services' upgraded documents (geo, safety, surveillance,
  emission, telemetry, ais-pipeline, fleet, notification 0.2): MMSI path parameters are strings,
  surveillance events are a union typed by `type` (the nullable-field casts are gone), and the
  UI uses the new fields where they replace workarounds — vessel identities on encounters and
  safety events, the nearest pipeline's name on safety states, `required` / `previousYear` on
  the CII fleet summary (no second page request against emission 0.2).
- The surveillance overview lives at `/surveillance` (`NavItem.end`); `/surveillance/overview`
  redirects there.
- `DateRangePicker label` prefixes the trigger's accessible name as hidden text, so the name
  contains the visible range (WCAG 2.5.3) without wrappers in the features.
- The map layer registry applies MapLibre registrations made while the style is busy (tiles
  loading) when the map becomes idle; the live map's workaround hook is gone.
- Code splitting: the vendor groups no longer capture their dependencies, so Vite's preload
  helper left `vendor-deckgl` and deck.gl is no longer part of the initial load (2.2 MB →
  1.24 MB raw, 657 → 388 kB gzip); MapLibre and deck.gl load with map pages only.
- `findBy*` queries of the unit tests wait up to 4 s (lazy pages under a parallel run).
- `e2e/screenshots.spec.ts` captures the shell (login); the pages come from the features'
  screenshot specs.

### Removed

- The two local first-fuel-formula parsers (vessels and admin, which disagreed on functions and
  error codes), the CII and SEEMP copies of the grade chip, year picker and number formatters,
  the telemetry `CopyText` and admin `Snippet`, three MSW problem helpers, the dashboard's
  rate sampler and per-vessel fuel queries, and the empty `.gitkeep` placeholders of filled
  feature folders.
- `PlaceholderPage`, `UnderConstruction` and the placeholder alerts bell (every module is
  built; the `topbar.alerts` slot renders nothing without an owner), and the feature copies of
  the shared helpers above (five `localizeProblem`, three `problemMessage`, six contracts
  locale hooks, six copy buttons, three method chip lists, two grade styles, two map fonts,
  three clocks, the map's `useNow` and layer workaround, three date-range name workarounds).

### Fixed

- Dialogs reopened while closing (e.g. the command palette right after a selection) rendered
  under their own overlay: the overlay faded out faster than the content, so its portal was
  re-appended after the content; overlays of dialogs, alert dialogs and sheets now use the
  content's duration (the role walkthrough failed on it intermittently).
- `pnpm perf:map` imported `playwright`, which the app does not depend on (now
  `@playwright/test`), and read the JS heap before enabling the CDP `Performance` domain (0 MB).
- CII vessel summary showed the reduction factor as "11%%"; the SEEMP year pickers rendered
  "Otomatis" in the monospace font; the API key guide still said keys never expire.
- The surveillance overview labelled daily buckets with times when the range started mid-day.
- A full page load no longer restores the scroll position of a different page
  (`ScrollRestoration getKey`).
- CII grade badges use near-black text on B, C and D (white failed WCAG AA on those colours).
- The smoke test's methodology selector matched every "N metode" text.

### Changed (foundation, before the features)

- Playwright: each run builds into `node_modules/.e2e/web-<port>` and writes
  `test-results/<port>`; ports in use are an error unless `E2E_REUSE_SERVERS=true`, so runs
  with their own `E2E_WEB_PORT` / `E2E_MOCK_PORT` can proceed in parallel in one checkout.

### Fixed (foundation, before the features)

- Map: MapLibre's web worker is registered (`setWorkerUrl` + `?url` import) before any map is
  created; GeoJSON sources (`useMapLibreLayers`), vector basemaps and `/tiles` render again.
- Sign-out: a failed `POST /auth/logout` is reported (toast with retry, background retries); a
  non-secret pending marker stops page loads from restoring the session from the refresh
  cookie (they call `/auth/logout` instead) until the revocation succeeds. The request uses
  fetch `keepalive` and the cross-tab refresh lock.
- Session: a refresh that completes after a sign-out is dropped (session generation counter;
  token broadcasts carry their source and are ignored while signed out or a sign-out is
  pending). Token expiry is derived from `expiresIn` only (skewed client clocks no longer cause
  a refresh every 5 s). Outside secure contexts a localStorage lease replaces the Web Locks API.
- Realtime: rejected handshakes and server-side disconnects are retried with backoff, a newly
  adopted token reconnects a socket that is down, and user/role changes re-handshake.
- Post-login redirects resolve the target as a URL (backslashes, control characters and other
  origins fall back to the dashboard instead of crashing).
- Accessibility: light-theme semantic colours meet WCAG AA as text, badge tint and button fill;
  names of the language toggle, search button and user menu contain their visible text; map
  pages have an h1 (`MapPageLayout` `title`); method cards use h2; the command palette moves
  focus to the page after a selection; scrolling formulas are keyboard focusable.
- Methodology page no longer scrolls horizontally (grid items `min-w-0`, formulas scroll in
  their box).
- Map legend and rings: medium collision risk is pink and dashed (high risk stays magenta and
  solid); the selected vessel keeps its safety ring under a separate selection halo.
- Dashboard: "Kapal terlacak" counts the platform's active vessels (`GET /ais/stats`), and
  "Alert terbuka" shows `GET /alerts/summary` (refreshed by the alert stream).
- nginx: `/assets/` is a `^~` location (hashed fonts get the immutable cache) and missing assets
  answer 404 with `no-store`.

### Changed (foundation review)

- Shell slots `topbar.actions` and `sidebar.footer` take any number of contributions
  (`{ component, order }`); `topbar.alerts` has a single owner and a second claim fails at
  start-up.
- ESLint: the local rule `ais/boundaries` (scripts/eslint-boundaries.mjs) enforces feature
  isolation for aliases and relative paths.
- E2E: the `e2e` project runs every `e2e/**/*.spec.ts` except the screenshots (`pnpm test:e2e`,
  CI); the mock gateway loads `e2e/mock-server/routes/*.mjs` (one file per feature); axe-core
  checks every sidebar page in both themes and a layout spec checks horizontal overflow.
- API clients generated for every service (auth, fleet, ais-processor, ais-ingestor,
  telemetry, emission, geo, safety, surveillance, notification).

## [0.1.0] - 2026-11-21

Foundation of the v2 web application (AIS Maritime Intelligence). Replaces the MVP frontend
(`ais-its-cii-seemp-fe`, Leaflet + direct `/api/v1` calls); the MVP remains on `mvp-version`.

### Added

- Tooling: Vite 8, React 19, TypeScript 6 (strict), Tailwind CSS 4, ESLint 9 flat config
  (typescript-eslint type-checked, react-hooks, jsx-a11y, TanStack Query, feature isolation
  rules), Prettier, husky + lint-staged + commitlint, vitest + Testing Library + MSW 2,
  Playwright smoke tests and screenshots, orval API generation.
- Design system: dark-first tokens with a light theme, Inter + JetBrains Mono (self-hosted),
  shadcn/ui-style primitives on Radix, domain components (CII grade, EWS, severity, collision
  risk and navstatus badges, MMSI/coordinate/unit formatters, DataTable with page and cursor
  adapters, StatCard, PageHeader, Section, KeyValueList, ConfirmDialog, Empty/Error states with
  RFC 9457 problem details, MethodInfo with KaTeX, DataAttribution).
- App shell: collapsible sidebar with the sections of spec §14, top bar with organization
  switcher, command palette (pages, vessel search, actions), realtime status, alerts bell slot,
  theme and language toggles, user menu; 404 and error boundaries; feature modules discovered
  from `src/features/*/routes.tsx` with per-feature i18n namespaces (id/en).
- Authentication: login with MFA step, forgot/reset password, invite acceptance, in-memory
  access token, refresh-cookie bootstrap, single-flight and cross-tab-safe refresh, retry on
  401, logout, org switch, `useSession` / `usePermission` / `useCanAccessOrg`, route guards.
- API layer: shared axios instance (bearer, X-Request-Id, refresh-on-401, ApiProblem), query
  client defaults, query key convention, orval configuration per service (skips services
  without `openapi.json`).
- Realtime: socket.io manager on `/ws` with token refresh on reconnect, normalized vessel store
  merging positions and safety states, REST seeding, hooks for viewport, vessel, alerts and CII.
- Map: MapView (MapLibre GL + deck.gl MapboxOverlay), basemap switcher (dark vector / OSM /
  Esri satellite), layer registry, viewport hook, vessel icon atlas from the legacy ship icons
  with heading rotation and safety rings, legends, full-bleed map page layout.
- Stub pages for every planned module, a live map, a dashboard scaffold and a methodology
  catalog page.
- Delivery: Dockerfile (node:24-alpine → nginx:1.29-alpine, non-root, runtime `/config.js`),
  nginx configuration, `.env.example`, CI, release and Dependabot workflows, feature guide.

### Removed

- MVP source code (`src/` pages, Leaflet maps, hard-coded data) and its reusable build/deploy
  workflows (SSH deployment); legacy assets kept: logo and ship-type icons.

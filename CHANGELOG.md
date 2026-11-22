# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

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

### Changed

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

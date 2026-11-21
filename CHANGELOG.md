# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

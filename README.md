# ais-its-web (MVP, branch `mvp-version`)

MVP web app of AIS Maritime Intelligence, formerly `ais-its-cii-seemp-fe`. It
uses the MVP API `ais-its-mvp-api` (`/api/v1`) until the cut-over to v2.

## Phase 0 hardening

- **Configuration** (`.env`, see `.env.example`): `VITE_BACKEND_URI` is the
  MVP API base URL including `/api/v1`, `VITE_STADIA_MAPS_API_KEY` the map
  tiles key. Phase 0 adds no new variables.
- **Polling**: fleet lists (`GET /ais`) refresh every 10 s, detail panels of
  the selected vessel every 5 s (`src/hooks/use-polling.ts`). Every response
  replaces the previous data (it used to be appended in chunks, which grew
  without bound), at most one request per panel is in flight, and timers and
  requests are cancelled on unmount and when the selection changes.
- **CII not available**: the backend answers `404 { code: "CII_NOT_AVAILABLE" }`
  when a vessel has no CII yet; the CII and SEEMP pages then show the message
  as an empty state.
- **Access token**: there is no login screen yet. Mutating API routes need a
  token from `POST /api/v1/auth/login`; when one is stored under
  `localStorage["aisits.accessToken"]` it is sent as
  `Authorization: Bearer <token>` with every backend request. A token stored
  under the former key `seemp.accessToken` is moved to it once, at startup.
  Logging in and writing from the browser also need the app's origin in the
  API's `ALLOWED_ORIGINS`; reads work from any origin.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
})
```

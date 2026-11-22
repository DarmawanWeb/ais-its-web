# Mock gateway routes

One file per feature (`<feature>.mjs`), loaded automatically by `../server.mjs` in file name
order, so parallel feature work never edits the same file. Export `routes`:

```js
import { nowIso } from '../lib.mjs';

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/alerts/summary', // exact path, or a RegExp with named groups
    handler: ({ send }) =>
      send(200, { total: 0, bySeverity: { info: 0, warning: 0, critical: 0 } }),
  },
  {
    method: 'PATCH',
    path: /^\/api\/v2\/zones\/(?<id>[^/]+)$/,
    handler: async ({ params, body, send }) => send(200, { id: params.id, ...(await body()) }),
  },
];
```

Routes require an access token unless `public: true` (the core answers 401 problem details).
Two files declaring the same method and path fail at start-up. Responses follow the service's
`openapi.json` (shapes of `src/shared/api/generated/<service>/model`). Unknown `/api/v2/*`
paths answer 404 problem details, like a service that is not deployed. For failures and delays
in a single test prefer Playwright's `page.route()` over mock state.

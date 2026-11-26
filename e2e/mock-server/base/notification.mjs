// Notification service (spec §13.9): open alert counts of the dashboard (smoke test: "1 kritis").
// The alerts feature may override it with a summary derived from its own alert mock.
/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/alerts/summary',
    handler: ({ send }) =>
      send(200, {
        total: 3,
        bySeverity: { info: 0, warning: 2, critical: 1 },
        byDomain: { safety: 2, surveillance: 1 },
        byType: { ews: 1, collision: 1, dark_vessel: 1 },
      }),
  },
];

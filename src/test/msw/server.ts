import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { authHandlers } from './auth-handlers';

/** Endpoints of services that do not exist yet answer 404 problem details by default. */
const fallbackHandlers = [
  http.all('*/api/v2/*', ({ request }) =>
    HttpResponse.json(
      {
        type: 'urn:ais-its:problem:not-found',
        title: 'Not found',
        status: 404,
        code: 'NOT_FOUND',
        instance: new URL(request.url).pathname,
      },
      { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
    ),
  ),
];

export const server = setupServer(...authHandlers, ...fallbackHandlers);

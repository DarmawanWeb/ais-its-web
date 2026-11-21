import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';

import { ApiProblem, isApiProblem, parseRetryAfter, toApiProblem } from './problem';
import { shouldRetry } from './query-client';

function axiosError(
  status: number | null,
  data?: unknown,
  headers: Record<string, string> = {},
  code?: string,
) {
  const config = {
    headers: new AxiosHeaders({ 'X-Request-Id': 'req-1' }),
  } as InternalAxiosRequestConfig;
  const response =
    status === null
      ? undefined
      : { status, statusText: '', data, headers: new AxiosHeaders(headers), config };
  return new AxiosError('failed', code, config, undefined, response);
}

describe('toApiProblem', () => {
  it('maps RFC 9457 problem details', () => {
    const problem = toApiProblem(
      axiosError(
        400,
        {
          type: 'urn:ais-its:problem:validation-failed',
          title: 'Validation failed',
          status: 400,
          code: 'VALIDATION_FAILED',
          detail: 'Body is invalid',
          instance: '/api/v2/vessels',
          traceId: 'abc',
          errors: [{ field: 'mmsi', message: 'Expected 9 digits' }],
          vesselId: 'extra-member',
        },
        { 'x-request-id': 'req-9' },
      ),
    );
    expect(problem).toBeInstanceOf(ApiProblem);
    expect(problem).toMatchObject({
      kind: 'http',
      status: 400,
      code: 'VALIDATION_FAILED',
      title: 'Validation failed',
      detail: 'Body is invalid',
      traceId: 'abc',
      requestId: 'req-9',
    });
    expect(problem.fieldErrors()).toEqual({ mmsi: 'Expected 9 digits' });
    expect(problem.extensions).toEqual({ vesselId: 'extra-member' });
    expect(problem.isClientError).toBe(true);
  });

  it('maps non-problem error bodies by status', () => {
    const problem = toApiProblem(axiosError(503, '<html>bad gateway</html>'));
    expect(problem).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE', kind: 'http' });
    expect(problem.isServerError).toBe(true);
  });

  it('reads Retry-After of throttled requests', () => {
    const problem = toApiProblem(
      axiosError(
        429,
        {
          type: 'urn:ais-its:problem:rate-limited',
          title: 'Too many requests',
          status: 429,
          code: 'RATE_LIMITED',
        },
        { 'retry-after': '42' },
      ),
    );
    expect(problem.retryAfterSeconds).toBe(42);
    expect(parseRetryAfter(new Date(Date.now() + 10_000).toUTCString())).toBeGreaterThanOrEqual(9);
    expect(parseRetryAfter(undefined)).toBeUndefined();
  });

  it('maps network errors, timeouts and cancellations', () => {
    expect(toApiProblem(axiosError(null, undefined, {}, 'ERR_NETWORK'))).toMatchObject({
      kind: 'network',
      status: 0,
      code: 'NETWORK_ERROR',
      requestId: 'req-1',
    });
    expect(toApiProblem(axiosError(null, undefined, {}, 'ECONNABORTED'))).toMatchObject({
      kind: 'timeout',
      code: 'TIMEOUT',
    });
    expect(toApiProblem(axiosError(null, undefined, {}, 'ERR_CANCELED'))).toMatchObject({
      kind: 'canceled',
    });
  });

  it('wraps unknown errors and keeps ApiProblems', () => {
    const problem = toApiProblem(new Error('boom'));
    expect(problem).toMatchObject({ kind: 'unknown', title: 'boom' });
    expect(toApiProblem(problem)).toBe(problem);
    expect(isApiProblem(problem)).toBe(true);
    expect(isApiProblem(new Error('x'))).toBe(false);
  });
});

describe('query retry policy', () => {
  it('never retries client errors', () => {
    expect(shouldRetry(0, toApiProblem(axiosError(404, undefined)))).toBe(false);
    expect(shouldRetry(0, toApiProblem(axiosError(422, undefined)))).toBe(false);
  });

  it('retries network and server errors twice', () => {
    const network = toApiProblem(axiosError(null, undefined, {}, 'ERR_NETWORK'));
    expect(shouldRetry(0, network)).toBe(true);
    expect(shouldRetry(1, toApiProblem(axiosError(500, undefined)))).toBe(true);
    expect(shouldRetry(2, network)).toBe(false);
  });
});

import { type FieldError, ProblemDetailsSchema } from '@darmawanweb/ais-its-contracts/api';
import { isAxiosError } from 'axios';

/** Kind of failure behind an {@link ApiProblem}. */
export type ApiProblemKind = 'http' | 'network' | 'timeout' | 'canceled' | 'unknown';

export interface ApiProblemInit {
  kind: ApiProblemKind;
  status: number;
  code: string;
  title: string;
  type?: string | undefined;
  detail?: string | undefined;
  instance?: string | undefined;
  traceId?: string | undefined;
  requestId?: string | undefined;
  errors?: readonly FieldError[] | undefined;
  retryAfterSeconds?: number | undefined;
  extensions?: Record<string, unknown> | undefined;
  cause?: unknown;
}

/**
 * Every failed API call rejects with an ApiProblem: an RFC 9457 problem details document
 * (spec §5) when the server sent one, or a synthetic problem for network errors, timeouts
 * and non-problem responses. TanStack Query's `error` is typed as ApiProblem.
 */
export class ApiProblem extends Error {
  readonly kind: ApiProblemKind;
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly type: string | undefined;
  readonly detail: string | undefined;
  readonly instance: string | undefined;
  readonly traceId: string | undefined;
  readonly requestId: string | undefined;
  readonly errors: readonly FieldError[];
  readonly retryAfterSeconds: number | undefined;
  readonly extensions: Record<string, unknown>;

  constructor(init: ApiProblemInit) {
    super(init.detail ?? init.title, { cause: init.cause });
    this.name = 'ApiProblem';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.title = init.title;
    this.type = init.type;
    this.detail = init.detail;
    this.instance = init.instance;
    this.traceId = init.traceId;
    this.requestId = init.requestId;
    this.errors = init.errors ?? [];
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.extensions = init.extensions ?? {};
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }

  /** Field errors keyed by field path, for react-hook-form `setError`. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.errors.map((error) => [error.field, error.message]));
  }
}

export function isApiProblem(value: unknown): value is ApiProblem {
  return value instanceof ApiProblem;
}

const DEFAULT_CODES: Record<number, { code: string; title: string }> = {
  400: { code: 'BAD_REQUEST', title: 'Bad request' },
  401: { code: 'UNAUTHORIZED', title: 'Unauthorized' },
  403: { code: 'FORBIDDEN', title: 'Forbidden' },
  404: { code: 'NOT_FOUND', title: 'Not found' },
  409: { code: 'CONFLICT', title: 'Conflict' },
  422: { code: 'VALIDATION_FAILED', title: 'Validation failed' },
  429: { code: 'RATE_LIMITED', title: 'Too many requests' },
  500: { code: 'INTERNAL_ERROR', title: 'Internal server error' },
  502: { code: 'BAD_GATEWAY', title: 'Bad gateway' },
  503: { code: 'SERVICE_UNAVAILABLE', title: 'Service unavailable' },
  504: { code: 'GATEWAY_TIMEOUT', title: 'Gateway timeout' },
};

function headerValue(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const getter = (headers as { get?: (key: string) => unknown }).get;
  const value =
    typeof getter === 'function'
      ? getter.call(headers, name)
      : (headers as Record<string, unknown>)[name.toLowerCase()];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Parses Retry-After (delta seconds or HTTP date) into seconds from now. */
export function parseRetryAfter(value: string | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000));
}

/** Maps any thrown value (axios error, problem document, Error) to an {@link ApiProblem}. */
function parseJsonText(data: unknown): unknown {
  if (typeof data !== 'string' || !data.trimStart().startsWith('{')) return data;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

export function toApiProblem(error: unknown): ApiProblem {
  if (isApiProblem(error)) return error;

  if (isAxiosError(error)) {
    const requestId =
      headerValue(error.response?.headers, 'x-request-id') ??
      headerValue(error.config?.headers, 'X-Request-Id');

    if (error.code === 'ERR_CANCELED') {
      return new ApiProblem({
        kind: 'canceled',
        status: 0,
        code: 'CANCELED',
        title: 'Request canceled',
        requestId,
        cause: error,
      });
    }
    if (!error.response) {
      const timeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      return new ApiProblem({
        kind: timeout ? 'timeout' : 'network',
        status: 0,
        code: timeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        title: timeout ? 'Request timed out' : 'Network error',
        detail: error.message,
        requestId,
        cause: error,
      });
    }

    const { status, headers } = error.response;
    // Text responses (CSV downloads) carry their problem details as a JSON string.
    const data: unknown = parseJsonText(error.response.data);
    const retryAfterSeconds = parseRetryAfter(headerValue(headers, 'retry-after'));
    const parsed = ProblemDetailsSchema.safeParse(data);
    if (parsed.success) {
      const { type, title, detail, instance, code, traceId, errors, ...extensions } = parsed.data;
      return new ApiProblem({
        kind: 'http',
        status: parsed.data.status || status,
        code,
        title,
        type,
        detail,
        instance,
        traceId,
        requestId,
        errors,
        retryAfterSeconds,
        extensions: Object.fromEntries(
          Object.entries(extensions).filter(([key]) => key !== 'status'),
        ),
        cause: error,
      });
    }
    const fallback = DEFAULT_CODES[status] ?? {
      code: status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR',
      title: `HTTP ${status}`,
    };
    const message =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : undefined;
    return new ApiProblem({
      kind: 'http',
      status,
      code: fallback.code,
      title: fallback.title,
      detail: message,
      requestId,
      retryAfterSeconds,
      cause: error,
    });
  }

  const parsed = ProblemDetailsSchema.safeParse(error);
  if (parsed.success) {
    return new ApiProblem({ kind: 'http', ...parsed.data, cause: error });
  }
  return new ApiProblem({
    kind: 'unknown',
    status: 0,
    code: 'UNKNOWN_ERROR',
    title: error instanceof Error ? error.message : 'Unknown error',
    cause: error,
  });
}

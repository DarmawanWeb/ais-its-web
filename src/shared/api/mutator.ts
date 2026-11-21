import type { AxiosRequestConfig } from 'axios';

import { http } from './http';
import type { ApiProblem } from './problem';

/**
 * orval mutator: every generated client (src/shared/api/generated/<service>) calls the API
 * through the shared axios instance, so generated hooks get the bearer token, X-Request-Id,
 * refresh-on-401 and ApiProblem errors for free.
 */
export function apiClient<T>(config: AxiosRequestConfig, options?: AxiosRequestConfig): Promise<T> {
  return http.request<T>({ ...config, ...options }).then(({ data }) => data);
}

/** Error type of generated hooks. */
export type ErrorType<_Error> = ApiProblem;

/** Body type of generated mutations. */
export type BodyType<Body> = Body;

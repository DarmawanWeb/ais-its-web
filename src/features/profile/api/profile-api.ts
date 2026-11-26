import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  getSessionsControllerListQueryKey,
  mfaControllerDisable,
  mfaControllerEnable,
  mfaControllerSetup,
  passwordsControllerChange,
  sessionsControllerRevoke,
  useSessionsControllerList,
} from '@/shared/api/generated/auth/auth/auth';
import {
  getMeControllerMeQueryKey,
  meControllerUpdate,
  useMeControllerMe,
} from '@/shared/api/generated/auth/me/me';
import type { ChangePasswordDto, MfaSetupDto } from '@/shared/api/generated/auth/model';
import { toApiProblem } from '@/shared/api/problem';
import { sharedKeys } from '@/shared/api/query-keys';
import { refreshAccessToken } from '@/shared/auth';

/** Sessions are few per account: one page holds them (the API caps pages at 100). */
export const SESSIONS_PAGE_SIZE = 100;

/** GET /api/v2/me: the full profile (memberships, roles, MFA, last sign-in). */
export function useProfile() {
  return useMeControllerMe({ query: { staleTime: 60_000 } });
}

/** GET /api/v2/auth/sessions: the account's active sessions (`current` marks this one). */
export function useSessions() {
  return useSessionsControllerList({ page: 1, pageSize: SESSIONS_PAGE_SIZE });
}

/** Refreshes every view of the profile: this page and the shell's (GET /me via useMe). */
function useInvalidateProfile() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getMeControllerMeQueryKey() }),
      queryClient.invalidateQueries({ queryKey: sharedKeys.me }),
    ]);
}

/** PATCH /api/v2/me {name}; a refresh then carries the new name in the token claims. */
export function useUpdateName() {
  const invalidate = useInvalidateProfile();
  return useMutation({
    mutationFn: (name: string) => meControllerUpdate({ name }),
    onSuccess: async () => {
      await invalidate();
      // The shell shows the name of the access token: a new token carries the new name.
      await refreshAccessToken().catch(() => null);
    },
  });
}

/** POST /api/v2/auth/password/change: 204, the other sessions are revoked. */
export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangePasswordDto) => passwordsControllerChange(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: getSessionsControllerListQueryKey() }),
  });
}

/**
 * Runs an MFA call without the shared refresh-and-retry on 401: a wrong code answers
 * `401 INVALID_MFA_CODE`, and a blind retry would spend a second attempt of the 5-per-15-minutes
 * throttle. Only a 401 about the token itself (expired) is refreshed and retried once.
 */
async function withoutCodeRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    const problem = toApiProblem(error);
    if (problem.status !== 401 || problem.code === 'INVALID_MFA_CODE') throw problem;
    const token = await refreshAccessToken();
    if (!token) throw problem;
    return call();
  }
}

const NO_REFRESH = { skipAuthRefresh: true } as const;

/** POST /api/v2/auth/mfa/setup: a pending secret and its otpauth URI (until enabled). */
export function useMfaSetup() {
  return useMutation<MfaSetupDto>({
    mutationFn: () => mfaControllerSetup(),
  });
}

/** POST /api/v2/auth/mfa/enable {code}. */
export function useMfaEnable() {
  const invalidate = useInvalidateProfile();
  return useMutation({
    mutationFn: (code: string) => withoutCodeRetry(() => mfaControllerEnable({ code }, NO_REFRESH)),
    onSuccess: () => invalidate(),
  });
}

/** POST /api/v2/auth/mfa/disable {code}. */
export function useMfaDisable() {
  const invalidate = useInvalidateProfile();
  return useMutation({
    mutationFn: (code: string) =>
      withoutCodeRetry(() => mfaControllerDisable({ code }, NO_REFRESH)),
    onSuccess: () => invalidate(),
  });
}

/** DELETE /api/v2/auth/sessions/:id (one or several sessions of the account). */
export function useRevokeSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: readonly string[]) => {
      const results = await Promise.allSettled(ids.map((id) => sessionsControllerRevoke(id)));
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length > 0) throw (failed[0] as PromiseRejectedResult).reason;
      return ids.length;
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: getSessionsControllerListQueryKey() }),
  });
}

import { keepPreviousData, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  apiKeysControllerCreate,
  apiKeysControllerRevoke,
  getApiKeysControllerListQueryKey,
  useApiKeysControllerList,
} from '@/shared/api/generated/auth/api-keys/api-keys';
import { useAuditLogsControllerList } from '@/shared/api/generated/auth/audit-logs/audit-logs';
import type {
  AuditLogsControllerListParams,
  CreateApiKeyDto,
  CreateOrganizationDto,
  InviteMemberDto,
  OrganizationDto,
  OrganizationsControllerListKind,
  UpdateMemberDtoRole,
  UpdateOrganizationDto,
  UpdateUserStatusDtoStatus,
  UsersControllerListStatus,
} from '@/shared/api/generated/auth/model';
import {
  getInvitationsControllerListQueryKey,
  getMembersControllerListQueryKey,
  getOrganizationsControllerListQueryKey,
  invitationsControllerCancel,
  membersControllerInvite,
  membersControllerRemove,
  membersControllerUpdate,
  organizationsControllerCreate,
  organizationsControllerRemove,
  organizationsControllerUpdate,
  useInvitationsControllerList,
  useMembersControllerList,
  useOrganizationsControllerGet,
  useOrganizationsControllerList,
} from '@/shared/api/generated/auth/organizations/organizations';
import {
  getUsersControllerListQueryKey,
  usersControllerSetStatus,
  useUsersControllerList,
} from '@/shared/api/generated/auth/users/users';
import { sharedKeys } from '@/shared/api/query-keys';
import { useSession } from '@/shared/auth';

// --- organizations --------------------------------------------------------------------------

export function useOrganizationList(params: {
  page: number;
  pageSize: number;
  search?: string;
  kind?: OrganizationsControllerListKind;
}) {
  return useOrganizationsControllerList(
    {
      page: params.page,
      pageSize: params.pageSize,
      ...(params.search ? { search: params.search } : {}),
      ...(params.kind ? { kind: params.kind } : {}),
    },
    { query: { placeholderData: keepPreviousData } },
  );
}

/** Every organization (platform administrators' pickers; the API caps pages at 100). */
export function useAllOrganizations(enabled: boolean) {
  return useOrganizationsControllerList(
    { page: 1, pageSize: 100 },
    { query: { enabled, staleTime: 5 * 60_000 } },
  );
}

/** One organization (members may read their own). */
export function useOrganization(id: string | null | undefined) {
  return useOrganizationsControllerGet(id ?? '', {
    query: { enabled: !!id, staleTime: 5 * 60_000 },
  });
}

function useInvalidateOrganizations() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getOrganizationsControllerListQueryKey() }),
      // The shell's org switcher lists organizations too.
      queryClient.invalidateQueries({ queryKey: ['auth', 'organizations'] }),
      queryClient.invalidateQueries({ queryKey: sharedKeys.me }),
    ]);
}

export function useCreateOrganization() {
  const invalidate = useInvalidateOrganizations();
  return useMutation({
    mutationFn: (body: CreateOrganizationDto) => organizationsControllerCreate(body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateOrganization() {
  const invalidate = useInvalidateOrganizations();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateOrganizationDto }) =>
      organizationsControllerUpdate(id, body),
    onSuccess: (organization: OrganizationDto) => {
      queryClient.setQueryData([`/api/v2/organizations/${organization.id}`], organization);
      return invalidate();
    },
  });
}

export function useDeleteOrganization() {
  const invalidate = useInvalidateOrganizations();
  return useMutation({
    mutationFn: (id: string) => organizationsControllerRemove(id),
    onSuccess: () => invalidate(),
  });
}

// --- users directory ------------------------------------------------------------------------

export function useUserDirectory(params: {
  page: number;
  pageSize: number;
  search?: string;
  status?: UsersControllerListStatus;
  enabled: boolean;
}) {
  return useUsersControllerList(
    {
      page: params.page,
      pageSize: params.pageSize,
      ...(params.search ? { search: params.search } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
    { query: { enabled: params.enabled, placeholderData: keepPreviousData } },
  );
}

export function useSetUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UpdateUserStatusDtoStatus }) =>
      usersControllerSetStatus(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: getUsersControllerListQueryKey() }),
  });
}

// --- members and invitations ----------------------------------------------------------------

export function useMembers(orgId: string | null, page: number, pageSize: number) {
  return useMembersControllerList(
    orgId ?? '',
    { page, pageSize },
    { query: { enabled: !!orgId, placeholderData: keepPreviousData } },
  );
}

/** Every member of an organization (role checks such as the last org admin; ≤ 100). */
export function useAllMembers(orgId: string | null) {
  return useMembersControllerList(
    orgId ?? '',
    { page: 1, pageSize: 100 },
    { query: { enabled: !!orgId, staleTime: 60_000 } },
  );
}

export function useInvitations(orgId: string | null, page: number, pageSize: number) {
  return useInvitationsControllerList(
    orgId ?? '',
    { page, pageSize },
    { query: { enabled: !!orgId, placeholderData: keepPreviousData } },
  );
}

function useInvalidateMembers() {
  const queryClient = useQueryClient();
  return (orgId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getMembersControllerListQueryKey(orgId) }),
      queryClient.invalidateQueries({ queryKey: getInvitationsControllerListQueryKey(orgId) }),
    ]);
}

export function useInviteMember() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({ orgId, body }: { orgId: string; body: InviteMemberDto }) =>
      membersControllerInvite(orgId, body),
    onSuccess: (_data, { orgId }) => invalidate(orgId),
  });
}

export function useUpdateMemberRole() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({
      orgId,
      userId,
      role,
    }: {
      orgId: string;
      userId: string;
      role: UpdateMemberDtoRole;
    }) => membersControllerUpdate(orgId, userId, { role }),
    onSuccess: (_data, { orgId }) => invalidate(orgId),
  });
}

export function useRemoveMember() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({ orgId, userId }: { orgId: string; userId: string }) =>
      membersControllerRemove(orgId, userId),
    onSuccess: (_data, { orgId }) => invalidate(orgId),
  });
}

export function useCancelInvitation() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({ orgId, invitationId }: { orgId: string; invitationId: string }) =>
      invitationsControllerCancel(orgId, invitationId),
    onSuccess: (_data, { orgId }) => invalidate(orgId),
  });
}

// --- API keys -------------------------------------------------------------------------------

/** API keys of an organization; `orgId` is sent for platform administrators only. */
export function useApiKeys(params: {
  orgId?: string;
  includeRevoked: boolean;
  page: number;
  pageSize: number;
  enabled?: boolean;
}) {
  const { isPlatformAdmin } = useSession();
  return useApiKeysControllerList(
    {
      page: params.page,
      pageSize: params.pageSize,
      includeRevoked: params.includeRevoked,
      ...(isPlatformAdmin && params.orgId ? { orgId: params.orgId } : {}),
    },
    { query: { enabled: params.enabled ?? true, placeholderData: keepPreviousData } },
  );
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateApiKeyDto) => apiKeysControllerCreate(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: getApiKeysControllerListQueryKey() }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiKeysControllerRevoke(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: getApiKeysControllerListQueryKey() }),
  });
}

// --- audit log ------------------------------------------------------------------------------

export const AUDIT_PAGE_SIZE = 50;

export function useAuditLogs(params: AuditLogsControllerListParams) {
  return useAuditLogsControllerList(
    { limit: AUDIT_PAGE_SIZE, ...params },
    { query: { placeholderData: keepPreviousData } },
  );
}

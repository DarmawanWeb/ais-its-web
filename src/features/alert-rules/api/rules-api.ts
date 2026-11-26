import { keepPreviousData, useMutation, useQueryClient } from '@tanstack/react-query';

import { useOrganizationsControllerList } from '@/shared/api/generated/auth/organizations/organizations';
import {
  useVesselsControllerGetByMmsi,
  useVesselsControllerList,
} from '@/shared/api/generated/fleet/vessels/vessels';
import { useZonesControllerList } from '@/shared/api/generated/geo/zones/zones';
import {
  alertRulesControllerCreate,
  alertRulesControllerRemove,
  alertRulesControllerRotateSecret,
  alertRulesControllerUpdate,
  getAlertRulesControllerListQueryKey,
  useAlertRulesControllerList,
} from '@/shared/api/generated/notification/alert-rules/alert-rules';
import type {
  AlertRuleDto,
  AlertRulePageDto,
  CreateAlertRuleDto,
  NotificationsControllerDeliveriesStatus,
  TestNotificationDto,
  UpdateAlertRuleDto,
} from '@/shared/api/generated/notification/model';
import {
  getNotificationsControllerDeliveriesQueryKey,
  notificationsControllerTest,
  useNotificationsControllerDeliveries,
} from '@/shared/api/generated/notification/notifications/notifications';

/** Rules of an organization are few: one page holds them (the API caps pages at 100). */
export const RULES_PAGE_SIZE = 100;
export const DELIVERIES_PAGE_SIZE = 25;

export interface RuleListFilter {
  /** `super_admin` only: rules of one organization (undefined = every organization). */
  orgId?: string;
  enabled?: boolean;
  page?: number;
}

/** GET /alert-rules (page-based; tenant-private, super_admin sees every organization). */
export function useRules(filter: RuleListFilter) {
  return useAlertRulesControllerList(
    {
      page: filter.page ?? 1,
      pageSize: RULES_PAGE_SIZE,
      ...(filter.orgId ? { orgId: filter.orgId } : {}),
      ...(filter.enabled === undefined ? {} : { enabled: filter.enabled }),
    },
    { query: { placeholderData: keepPreviousData } },
  );
}

function useInvalidateRules() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: getAlertRulesControllerListQueryKey() });
}

export function useCreateRule() {
  const invalidate = useInvalidateRules();
  return useMutation({
    mutationFn: (body: CreateAlertRuleDto) => alertRulesControllerCreate(body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateRule() {
  const invalidate = useInvalidateRules();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAlertRuleDto }) =>
      alertRulesControllerUpdate(id, body),
    onSuccess: () => invalidate(),
  });
}

/**
 * POST /alert-rules/:id/channels/:index/rotate-secret: a new signing key for a webhook channel.
 * The response is the rule; only this response carries the new `signingSecret`.
 */
export function useRotateSecret() {
  const invalidate = useInvalidateRules();
  return useMutation({
    mutationFn: ({ id, index }: { id: string; index: number }) =>
      alertRulesControllerRotateSecret(id, index),
    onSuccess: () => invalidate(),
  });
}

/** PATCH {enabled} with an optimistic switch on every cached rule list. */
export function useToggleRule() {
  const queryClient = useQueryClient();
  const listKey = getAlertRulesControllerListQueryKey();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      alertRulesControllerUpdate(id, { enabled }),
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueriesData<AlertRulePageDto>({ queryKey: listKey });
      queryClient.setQueriesData<AlertRulePageDto>({ queryKey: listKey }, (page) =>
        page
          ? {
              ...page,
              data: page.data.map((rule) => (rule.id === id ? { ...rule, enabled } : rule)),
            }
          : page,
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rule: AlertRuleDto) => alertRulesControllerRemove(rule.id),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: getAlertRulesControllerListQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getNotificationsControllerDeliveriesQueryKey() }),
      ]),
  });
}

/** POST /notifications/test: Telegram / webhook sent at once, e-mail queued (10 per 10 min). */
export function useTestNotification() {
  return useMutation({
    mutationFn: (body: TestNotificationDto) => notificationsControllerTest(body),
  });
}

/** GET /notifications/deliveries (cursor pages, newest first) of one rule or of every rule. */
export function useDeliveries(params: {
  ruleId?: string;
  status?: NotificationsControllerDeliveriesStatus;
  cursor?: string | null;
  limit?: number;
  enabled?: boolean;
}) {
  return useNotificationsControllerDeliveries(
    {
      limit: params.limit ?? DELIVERIES_PAGE_SIZE,
      ...(params.ruleId ? { ruleId: params.ruleId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.cursor ? { cursor: params.cursor } : {}),
    },
    { query: { enabled: params.enabled ?? true, placeholderData: keepPreviousData } },
  );
}

/** Organizations for the platform administrator's filter and owner choice. */
export function useOrganizations(enabled: boolean) {
  return useOrganizationsControllerList(
    { page: 1, pageSize: 100 },
    { query: { enabled, staleTime: 5 * 60_000 } },
  );
}

/** Vessel search of the vessel filter (identity of every vessel; `orgId` limits to a fleet). */
export function useVesselSearch(search: string, orgId: string | undefined, enabled = true) {
  return useVesselsControllerList(
    { search: search || undefined, pageSize: 20, ...(orgId ? { orgId } : {}) },
    { query: { enabled, placeholderData: keepPreviousData, staleTime: 60_000 } },
  );
}

/** Name of a vessel of the filter (MMSI chips). */
export function useVesselName(mmsi: number) {
  const query = useVesselsControllerGetByMmsi(String(mmsi), {
    query: { staleTime: 10 * 60_000, retry: false },
  });
  return query.data?.name ?? null;
}

/** Zones for the zone filter (and the names of selected zones). */
export function useZoneOptions(search = '') {
  return useZonesControllerList(
    { pageSize: 100, ...(search ? { search } : {}) },
    { query: { staleTime: 5 * 60_000, placeholderData: keepPreviousData } },
  );
}

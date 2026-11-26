import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import {
  alertsControllerAcknowledge,
  alertsControllerResolve,
  getAlertsControllerListQueryKey,
  getAlertsControllerSummaryQueryKey,
} from '@/shared/api/generated/notification/alerts/alerts';
import type { AlertDto } from '@/shared/api/generated/notification/model';
import { isApiProblem, toApiProblem } from '@/shared/api/problem';
import { toast } from '@/shared/ui/sonner';

import {
  patchAlertCaches,
  restoreAlertCaches,
  snapshotAlertCaches,
  type AlertCacheSnapshot,
} from '../lib/alert-cache';

export type AlertAction = 'acknowledge' | 'resolve';

/** Friendly, translated message of a failed acknowledge / resolve (notification error codes). */
export function alertProblemMessage(error: unknown, t: TFunction): string {
  const problem = isApiProblem(error) ? error : toApiProblem(error);
  switch (problem.code) {
    case 'ALERT_ALREADY_RESOLVED':
      return t('alerts:errors.alreadyResolved');
    case 'ALERT_NOT_FOUND':
      return t('alerts:errors.notFound');
    case 'FORBIDDEN':
    case 'INSUFFICIENT_PERMISSIONS':
      return t('alerts:errors.forbidden');
    case 'RATE_LIMITED':
      return t('alerts:errors.rateLimited');
    default:
      if (problem.kind === 'network' || problem.kind === 'timeout')
        return t('alerts:errors.network');
      if (problem.status === 403) return t('alerts:errors.forbidden');
      return problem.detail ?? problem.title ?? t('alerts:errors.generic');
  }
}

/** The optimistic state of an alert after the action (until the server answers). */
function optimisticPatch(
  id: string,
  action: AlertAction,
  userId: string | null,
): Partial<AlertDto> & { id: string } {
  const now = new Date().toISOString();
  return action === 'acknowledge'
    ? { id, status: 'acknowledged', acknowledgedAt: now, acknowledgedBy: userId }
    : { id, status: 'resolved', resolvedAt: now, resolvedBy: userId };
}

/**
 * Acknowledge / resolve with optimistic updates (`alert:ack`, spec §8.4): every cached list page
 * and the detail change at once, roll back on failure (toast with the mapped problem), then the
 * lists and the open counts are refreshed from the server.
 */
export function useAlertTransition(userId: string | null) {
  const { t } = useTranslation('alerts');
  const queryClient = useQueryClient();
  return useMutation<AlertDto, unknown, { id: string; action: AlertAction }, AlertCacheSnapshot>({
    mutationKey: ['alerts', 'transition'],
    mutationFn: ({ id, action }) =>
      action === 'acknowledge' ? alertsControllerAcknowledge(id) : alertsControllerResolve(id),
    onMutate: async ({ id, action }) => {
      await queryClient.cancelQueries({ queryKey: getAlertsControllerListQueryKey() });
      const snapshot = snapshotAlertCaches(queryClient, id);
      patchAlertCaches(queryClient, optimisticPatch(id, action, userId));
      return snapshot;
    },
    onError: (error, _variables, snapshot) => {
      if (snapshot) restoreAlertCaches(queryClient, snapshot);
      toast.error(t('actions.failed'), { description: alertProblemMessage(error, t) });
    },
    onSuccess: (alert, { action }) => {
      patchAlertCaches(queryClient, alert);
      toast.success(action === 'acknowledge' ? t('actions.acknowledged') : t('actions.resolved'));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: getAlertsControllerSummaryQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getAlertsControllerListQueryKey() });
    },
  });
}

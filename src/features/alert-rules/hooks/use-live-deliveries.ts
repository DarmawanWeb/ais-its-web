import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { getNotificationsControllerDeliveriesQueryKey } from '@/shared/api/generated/notification/notifications/notifications';
import { throttle } from '@/shared/lib/utils';
import { useAlertStream } from '@/shared/realtime';

/**
 * Deliveries are planned with the alert that matched a rule (spec §13.9), so every
 * `alert:raised` / `alert:updated` may add or move delivery rows: refetch the delivery log
 * (throttled to one refetch per 3 s during alert bursts).
 */
export function useLiveDeliveries(): void {
  const queryClient = useQueryClient();
  const refetch = useMemo(
    () =>
      throttle(() => {
        void queryClient.invalidateQueries({
          queryKey: getNotificationsControllerDeliveriesQueryKey(),
        });
      }, 3_000),
    [queryClient],
  );
  useEffect(() => () => refetch.cancel(), [refetch]);
  useAlertStream(() => refetch());
}

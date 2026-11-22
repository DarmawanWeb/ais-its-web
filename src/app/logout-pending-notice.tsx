import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { retryPendingLogout, useSessionStore } from '@/shared/auth/session';
import { toast } from '@/shared/ui/sonner';

const TOAST_ID = 'logout-pending';

/**
 * Tells the user when a sign-out has not reached the server (POST /auth/logout failed) and
 * offers a retry; the session layer also retries in the background and never restores the
 * session from the refresh cookie meanwhile. Mounted once by the app providers, so it stays
 * visible on the login page.
 */
export function LogoutPendingNotice() {
  const { t } = useTranslation();
  const pending = useSessionStore((state) => state.logoutPending);
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      toast.warning(t('shell.logoutPending.title'), {
        id: TOAST_ID,
        description: t('shell.logoutPending.description'),
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: t('shell.logoutPending.retry'),
          onClick: (event) => {
            // Keep the notice until the retry succeeds (the store update dismisses it).
            event.preventDefault();
            void retryPendingLogout();
          },
        },
      });
      return;
    }
    if (wasPending.current) {
      wasPending.current = false;
      toast.dismiss(TOAST_ID);
      toast.success(t('shell.logoutPending.done'));
    }
  }, [pending, t]);

  return null;
}

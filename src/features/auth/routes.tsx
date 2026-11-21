import { RedirectIfAuthenticated } from '@/shared/auth/guards';
import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/**
 * Authentication (spec §8, §13.1): public pages outside the app shell. The session logic
 * itself lives in src/shared/auth (used by every feature).
 */
export const feature = defineFeature({
  id: 'auth',
  i18n: { id, en },
  publicRoutes: [
    {
      lazy: lazyPage(() => import('./components/auth-layout'), 'AuthLayout'),
      children: [
        {
          element: <RedirectIfAuthenticated />,
          children: [
            {
              path: 'login',
              handle: { titleKey: 'auth:login.title' },
              lazy: lazyPage(() => import('./pages/login-page'), 'LoginPage'),
            },
            {
              path: 'forgot-password',
              handle: { titleKey: 'auth:forgot.title' },
              lazy: lazyPage(() => import('./pages/forgot-password-page'), 'ForgotPasswordPage'),
            },
          ],
        },
        {
          path: 'reset-password',
          handle: { titleKey: 'auth:reset.title' },
          lazy: lazyPage(() => import('./pages/reset-password-page'), 'ResetPasswordPage'),
        },
        {
          path: 'accept-invite',
          handle: { titleKey: 'auth:invite.title' },
          lazy: lazyPage(() => import('./pages/reset-password-page'), 'AcceptInvitePage'),
        },
      ],
    },
  ],
});

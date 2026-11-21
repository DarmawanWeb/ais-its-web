import { Home, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

import { HOME_PATH } from '@/shared/auth/paths';
import { BrandLogo } from '@/shared/domain-ui/brand';
import { ErrorState } from '@/shared/domain-ui/feedback';
import { Button } from '@/shared/ui/button';

import { NotFoundPage } from './not-found-page';

function ErrorDetails({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!import.meta.env.DEV || !(error instanceof Error)) return null;
  return (
    <details className="mx-auto mt-2 max-w-2xl text-left text-xs text-muted-foreground">
      <summary className="cursor-pointer">{t('errors.details')}</summary>
      <pre className="mt-2 overflow-auto rounded-md border bg-muted/40 p-3 whitespace-pre-wrap">
        {error.stack ?? error.message}
      </pre>
    </details>
  );
}

/** Error boundary of the pages inside the shell (navigation stays usable). */
export function RouteErrorBoundary() {
  const { t } = useTranslation();
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return (
    <div className="py-16">
      <ErrorState
        title={t('errors.boundaryTitle')}
        description={t('errors.boundaryDescription')}
        onRetry={() => window.location.reload()}
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link to={HOME_PATH}>
              <Home /> {t('actions.goHome')}
            </Link>
          </Button>
        }
      />
      <ErrorDetails error={error} />
    </div>
  );
}

/** Last-resort error page (outside the shell). */
export function RootErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6">
      <BrandLogo />
      <ErrorState
        title={t('errors.boundaryTitle')}
        description={t('errors.genericDescription')}
        action={
          <Button size="sm" onClick={() => window.location.assign('/')}>
            <RefreshCw /> {t('actions.retry')}
          </Button>
        }
      />
      <ErrorDetails error={error} />
    </div>
  );
}

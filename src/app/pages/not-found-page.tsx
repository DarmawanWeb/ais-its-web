import { Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { HOME_PATH } from '@/shared/auth/paths';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { Button } from '@/shared/ui/button';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <p className="font-mono text-6xl font-semibold tracking-tight text-primary/80">404</p>
        <EmptyState
          icon={Compass}
          title={t('errors.notFound')}
          description={t('errors.notFoundDescription')}
          action={
            <Button asChild>
              <Link to={HOME_PATH}>{t('actions.goHome')}</Link>
            </Button>
          }
        />
      </div>
    </div>
  );
}

import { Bell, BellRing } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

/**
 * Placeholder of the live alerts bell. The alerts feature replaces it by plugging a
 * component into the "topbar.alerts" slot (see docs/FEATURE_GUIDE.md).
 */
export function AlertsBellPlaceholder() {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('shell.alerts.label')}
          data-testid="alerts-bell"
        >
          <Bell />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">{t('shell.alerts.label')}</div>
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <BellRing className="size-4" />
          </span>
          <p className="text-sm font-medium">{t('shell.alerts.empty')}</p>
          <p className="text-xs text-muted-foreground">{t('shell.alerts.pending')}</p>
        </div>
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link to="/alerts">{t('shell.alerts.viewAll')}</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

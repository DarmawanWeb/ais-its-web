import { GitCompareArrows } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/spinner';

/**
 * `412 ZONE_VERSION_CONFLICT`: someone changed the zone since it was opened. The user reloads
 * the latest version (dropping their change) or overwrites it with their change (sent again
 * with the current version in `If-Match`).
 */
export function ConflictDialog({
  open,
  action,
  onOpenChange,
  onReload,
  onOverwrite,
}: {
  open: boolean;
  action: 'save' | 'delete';
  onOpenChange: (open: boolean) => void;
  onReload: () => void | Promise<void>;
  onOverwrite: () => void | Promise<void>;
}) {
  const { t } = useTranslation('zones');
  const [busy, setBusy] = useState<'reload' | 'overwrite' | null>(null);
  const run = async (kind: 'reload' | 'overwrite') => {
    setBusy(kind);
    try {
      await (kind === 'reload' ? onReload() : onOverwrite());
    } finally {
      setBusy(null);
    }
  };
  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="size-5 text-warning" aria-hidden /> {t('conflict.title')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {action === 'save' ? t('conflict.descriptionSave') : t('conflict.descriptionDelete')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={busy !== null}>
            {t('common:actions.cancel')}
          </AlertDialogCancel>
          <Button variant="outline" disabled={busy !== null} onClick={() => void run('reload')}>
            {busy === 'reload' && <Spinner />}
            {t('conflict.reload')}
          </Button>
          <Button disabled={busy !== null} onClick={() => void run('overwrite')}>
            {busy === 'overwrite' && <Spinner />}
            {action === 'save' ? t('conflict.overwrite') : t('conflict.deleteAnyway')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

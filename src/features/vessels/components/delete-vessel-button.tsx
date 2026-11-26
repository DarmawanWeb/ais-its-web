import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { VesselDetailDto } from '@/shared/api/generated/fleet/model';
import { useVesselsControllerRemove } from '@/shared/api/generated/fleet/vessels/vessels';
import { ConfirmDialog } from '@/shared/domain-ui/confirm-dialog';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/sonner';

import { useVesselCache } from '../api/vessels';
import { problemSummary } from '@/shared/api/problem-copy';
import { fleetProblemCopies } from '../lib/problems';

/** Deletes a vessel after a confirmation (`DELETE /vessels/:id`, `vessel:write`, own org). */
export function DeleteVesselButton({
  vessel,
  onDeleted,
  size = 'sm',
}: {
  vessel: Pick<VesselDetailDto, 'id' | 'mmsi' | 'name'>;
  onDeleted: () => void;
  size?: 'sm' | 'default';
}) {
  const { t } = useTranslation('vessels');
  const remove = useVesselsControllerRemove();
  const cache = useVesselCache();
  return (
    <ConfirmDialog
      destructive
      title={t('delete.title', { name: vessel.name })}
      description={t('delete.description', { mmsi: vessel.mmsi })}
      confirmLabel={t('delete.confirm')}
      onConfirm={async () => {
        try {
          await remove.mutateAsync({ id: vessel.id });
          cache.remove(vessel);
          toast.success(t('delete.done', { name: vessel.name }));
          onDeleted();
        } catch (error) {
          toast.error(t('delete.failed'), {
            description: problemSummary(error, fleetProblemCopies(t)),
          });
        }
      }}
      trigger={
        <Button variant="outline" size={size} className="text-danger hover:text-danger">
          <Trash2 /> {t('actions.delete')}
        </Button>
      }
    />
  );
}

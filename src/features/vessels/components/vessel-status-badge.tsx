import { VESSEL_STATUS_LABELS, type VesselStatus } from '@darmawanweb/ais-its-contracts/domain';

import { Badge } from '@/shared/ui/badge';

import { useAppLanguage } from '@/shared/i18n';

const VARIANT: Record<VesselStatus, 'success' | 'muted' | 'warning'> = {
  active: 'success',
  inactive: 'muted',
  laid_up: 'warning',
};

/** Fleet status of a vessel (contracts labels). */
export function VesselStatusBadge({ status }: { status: VesselStatus }) {
  const locale = useAppLanguage();
  return (
    <Badge variant={VARIANT[status]} className="gap-1.5">
      <span
        className={
          status === 'active'
            ? 'size-1.5 rounded-full bg-success'
            : status === 'laid_up'
              ? 'size-1.5 rounded-full bg-warning'
              : 'size-1.5 rounded-full bg-muted-foreground'
        }
        aria-hidden
      />
      {VESSEL_STATUS_LABELS[status][locale]}
    </Badge>
  );
}

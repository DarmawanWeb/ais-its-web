import { CiiGradeBadge } from '@/shared/domain-ui/badges';
import { useTranslation } from 'react-i18next';

import { useVesselTableData } from '../hooks/vessel-table-context';
import { LastSeen } from './last-seen';

/** "Last seen" cell of the fleet list. */
export function LastSeenCell({ mmsi }: { mmsi: number }) {
  const { lastSeen, lastSeenPending } = useVesselTableData();
  const position = lastSeen.get(mmsi);
  if (position === undefined && lastSeenPending) {
    return <span className="inline-block h-3 w-20 animate-pulse rounded bg-muted" aria-hidden />;
  }
  return <LastSeen time={position?.time ?? null} />;
}

/** Current CII grade cell of the fleet list (own vessels). */
export function CiiCell({ mmsi }: { mmsi: number }) {
  const { t } = useTranslation('vessels');
  const { cii } = useVesselTableData();
  const entry = cii.get(mmsi);
  return entry?.grade ? (
    <CiiGradeBadge grade={entry.grade} size="sm" />
  ) : (
    <span className="text-xs text-muted-foreground">{t('list.ciiNone')}</span>
  );
}

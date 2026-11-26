import { KeyValueList } from '@/shared/domain-ui/key-value-list';

import type { SurveillanceEvent } from '../lib/dto';
import { useEventDetailItems } from '../hooks/use-event-detail-items';

/** The detector-specific figures of an event as a key/value list. */
export function EventDetails({ event }: { event: SurveillanceEvent }) {
  const items = useEventDetailItems(event);
  if (items.length === 0) return null;
  return <KeyValueList items={items} columns={2} dense />;
}

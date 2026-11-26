import { alertTypeLabel, isAlertType } from '@darmawanweb/ais-its-contracts/domain';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { SeverityBadge } from '@/shared/domain-ui/badges';
import { ErrorState } from '@/shared/domain-ui/feedback';
import { KeyValueList } from '@/shared/domain-ui/key-value-list';
import { CoordinateText } from '@/shared/domain-ui/values';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Separator } from '@/shared/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';

import type { SurveillanceEvent } from '../lib/dto';
import { useSurveillanceEvent } from '../api/queries';
import { EventStatusBadge, VesselCell } from './bits';
import { EventDetails } from './event-details';
import { EventTimeline } from './event-timeline';
import { MethodChips } from '@/shared/domain-ui/method-chips';
import { ReviewPanel } from './review-panel';
import { useEventText } from '../hooks/use-event-text';

function typeLabel(type: string, locale: 'id' | 'en') {
  return isAlertType(type) ? alertTypeLabel(type, locale) : type;
}

/**
 * Detail of a surveillance event in a side sheet: what was detected, the detector figures with
 * their methods, the lifecycle and the review. The list row is shown at once; the fresh event
 * (`GET /surveillance/events/:id`) replaces it when loaded.
 */
export function EventDetailSheet({
  event: listEvent,
  open,
  onOpenChange,
}: {
  event: SurveillanceEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation('surveillance');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const query = useSurveillanceEvent(open ? listEvent?.id : null);
  const event = query.data ?? listEvent;
  const text = useEventText();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full gap-0 overflow-y-auto sm:max-w-lg"
        closeLabel={t('common:actions.close')}
      >
        {event ? (
          <>
            <SheetHeader className="gap-2 border-b pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold tracking-wide text-primary uppercase">
                  {typeLabel(event.type, locale)}
                </span>
                <SeverityBadge severity={event.currentSeverity} />
                <EventStatusBadge status={event.status} />
              </div>
              <SheetTitle className="text-base leading-snug">{text.title(event)}</SheetTitle>
              <SheetDescription>{text.description(event)}</SheetDescription>
            </SheetHeader>
            {query.isError && query.error.status === 404 ? (
              <ErrorState error={query.error} size="sm" />
            ) : (
              <div className="space-y-6 p-4">
                <KeyValueList
                  columns={2}
                  dense
                  items={[
                    {
                      key: 'vessel',
                      label: t('fields.vessel'),
                      value: <VesselCell mmsi={event.mmsi} name={event.vesselName} />,
                    },
                    ...(event.relatedMmsi
                      ? [
                          {
                            key: 'related',
                            label: t('fields.relatedVessel'),
                            value: (
                              <VesselCell mmsi={event.relatedMmsi} name={event.relatedVesselName} />
                            ),
                          },
                        ]
                      : []),
                    {
                      key: 'time',
                      label: t('fields.time'),
                      value: (
                        <span title={formatRelativeTime(event.time, i18n.language)}>
                          {formatDateTime(event.time, i18n.language)}
                        </span>
                      ),
                    },
                    {
                      key: 'position',
                      label: t('fields.position'),
                      value:
                        event.lat !== null && event.lon !== null ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3 text-muted-foreground" aria-hidden />
                            <CoordinateText lat={event.lat} lon={event.lon} copyable />
                          </span>
                        ) : (
                          '—'
                        ),
                    },
                    {
                      key: 'method',
                      label: t('fields.method'),
                      value: <MethodChips methodIds={[event.methodId]} />,
                    },
                  ]}
                />
                <EventDetails event={event} />
                {event.type === 'transhipment' && (
                  <Button asChild variant="subtle" className="w-full">
                    <Link to={`/surveillance/transhipment/${event.id}`}>
                      {t('transhipment.openReplay')} <ArrowUpRight />
                    </Link>
                  </Button>
                )}
                <Separator />
                <section aria-labelledby="event-timeline-title" className="space-y-3">
                  <h3 id="event-timeline-title" className="text-sm font-semibold">
                    {t('timeline.title')}
                  </h3>
                  <EventTimeline event={event} />
                </section>
                <Separator />
                <ReviewPanel key={`${event.id}:${event.reviewedAt ?? ''}`} event={event} />
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3 p-4">
            <SheetTitle className="sr-only">{t('common:status.loading')}</SheetTitle>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

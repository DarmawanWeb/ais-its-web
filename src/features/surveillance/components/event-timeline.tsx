import { SURVEILLANCE_EVENT_STATUS_LABELS } from '@darmawanweb/ais-its-contracts/domain';
import { CircleCheck, Eye, Gavel, Radar, ScanSearch, Timer, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { formatDateTime, formatNumber, formatRelativeTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';

import type { SurveillanceEvent, TranshipmentResult } from '../lib/dto';
import { resolutionReasonKey, supersededBy } from '../lib/event-data';
import { eventTimeline, type TimelineKind } from '../lib/review';

const ICONS: Record<TimelineKind, LucideIcon> = {
  occurred: Timer,
  opened: Radar,
  analysis: ScanSearch,
  lastSeen: Eye,
  resolved: CircleCheck,
  reviewed: Gavel,
};

const TONES: Record<TimelineKind, string> = {
  occurred: 'bg-muted text-muted-foreground',
  opened: 'bg-warning/15 text-warning',
  analysis: 'bg-primary/12 text-primary',
  lastSeen: 'bg-info/15 text-info',
  resolved: 'bg-success/15 text-success',
  reviewed: 'bg-chart-2/20 text-foreground',
};

/**
 * Why the detector ended an occurrence: the known reasons translated (unknown ones as sent); an
 * escalated transhipment links to the occurrence that superseded it.
 */
function ResolutionReason({ event, reason }: { event: SurveillanceEvent; reason: string }) {
  const { t } = useTranslation('surveillance');
  const key = resolutionReasonKey(reason);
  const next = key === 'escalated' ? supersededBy(event.resolution) : null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {t('timeline.reason', { reason: key ? t(`resolution.${key}`) : reason })}
      {next && event.type === 'transhipment' && (
        <>
          {' '}
          <Link
            to={`/surveillance/transhipment/${next}`}
            className="text-primary underline underline-offset-2 hover:no-underline"
          >
            {t('resolution.openSuccessor')}
          </Link>
        </>
      )}
    </p>
  );
}

/** Lifecycle of an event: occurrence, detection, analyses, last sighting, end and review. */
export function EventTimeline({
  event,
  results,
  className,
}: {
  event: SurveillanceEvent;
  results?: readonly TranshipmentResult[];
  className?: string;
}) {
  const { t, i18n } = useTranslation('surveillance');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const entries = eventTimeline(event, results);
  return (
    <ol className={cn('relative space-y-4 border-l border-border pl-6', className)}>
      {entries.map((entry, index) => {
        const Icon = ICONS[entry.kind];
        const status = entry.detail?.status;
        return (
          <li key={`${entry.kind}-${index}`} className="relative">
            <span
              className={cn(
                'absolute top-0 -left-[2.15rem] flex size-7 items-center justify-center rounded-full ring-4 ring-surface',
                TONES[entry.kind],
              )}
              aria-hidden
            >
              <Icon className="size-3.5" />
            </span>
            <p className="text-sm font-medium">
              {entry.kind === 'reviewed' && status && status in SURVEILLANCE_EVENT_STATUS_LABELS
                ? t('timeline.reviewedAs', {
                    status:
                      SURVEILLANCE_EVENT_STATUS_LABELS[
                        status as keyof typeof SURVEILLANCE_EVENT_STATUS_LABELS
                      ][locale],
                  })
                : entry.kind === 'analysis' && entry.detail?.accuracy !== undefined
                  ? t('timeline.analysisScore', {
                      accuracy: formatNumber(entry.detail.accuracy, i18n.language, {
                        maximumFractionDigits: 1,
                      }),
                    })
                  : t(`timeline.${entry.kind}`)}
            </p>
            <p className="text-xs text-muted-foreground">
              <time dateTime={entry.at}>{formatDateTime(entry.at, i18n.language)}</time>
              {' · '}
              {formatRelativeTime(entry.at, i18n.language)}
            </p>
            {entry.detail?.reason && (
              <ResolutionReason event={event} reason={entry.detail.reason} />
            )}
            {entry.kind === 'reviewed' && entry.detail?.note && (
              <p className="mt-1 rounded-md bg-muted/50 px-2 py-1 text-xs whitespace-pre-wrap">
                {entry.detail.note}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

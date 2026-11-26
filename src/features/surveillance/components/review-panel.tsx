import { SURVEILLANCE_EVENT_STATUS_LABELS } from '@darmawanweb/ais-its-contracts/domain';
import { ClipboardCheck, Lock } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { toApiProblem } from '@/shared/api/problem';
import { usePermission, useSession } from '@/shared/auth';
import { formatDateTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';
import { Spinner } from '@/shared/ui/spinner';
import { Textarea } from '@/shared/ui/textarea';

import type { SurveillanceEvent } from '../lib/dto';
import { useReviewEvent } from '../api/queries';
import { initialReviewStatus, reviewBody, reviewChanged } from '../lib/review';
import { REVIEW_STATUSES, type ReviewStatus } from '../lib/types';
import { EventStatusBadge } from './bits';

const NOTE_MAX = 2000;

/** Who reviewed the event and when ("you" for the signed-in user). */
function ReviewedBy({ event }: { event: SurveillanceEvent }) {
  const { t, i18n } = useTranslation('surveillance');
  const { userId } = useSession();
  if (!event.reviewedAt)
    return <p className="text-xs text-muted-foreground">{t('review.notReviewed')}</p>;
  const who =
    event.reviewedBy && event.reviewedBy === userId ? t('review.you') : t('review.reviewer');
  return (
    <p className="text-xs text-muted-foreground">
      {t('review.reviewedBy', { who, at: formatDateTime(event.reviewedAt, i18n.language) })}
    </p>
  );
}

/**
 * Review of an event (spec §13.8, `PATCH /surveillance/events/:id`, permission
 * `surveillance:review`): verdict and note. An unchanged note is not sent, so the service keeps
 * it; emptying the note clears it. Without the permission the verdict is shown read-only.
 */
export function ReviewPanel({
  event,
  className,
}: {
  event: SurveillanceEvent;
  className?: string;
}) {
  const { t, i18n } = useTranslation('surveillance');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const canReview = usePermission('surveillance:review');
  const id = useId();
  const [status, setStatus] = useState<ReviewStatus>(() => initialReviewStatus(event));
  const [note, setNote] = useState(event.note ?? '');
  const review = useReviewEvent();
  const changed = reviewChanged(event, status, note);

  if (!canReview) {
    return (
      <section aria-labelledby={`${id}-title`} className={cn('space-y-3', className)}>
        <h3 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="size-4 text-muted-foreground" aria-hidden /> {t('review.title')}
        </h3>
        <div className="flex items-center gap-2">
          <EventStatusBadge status={event.status} />
        </div>
        {event.note && (
          <p className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
            {event.note}
          </p>
        )}
        <ReviewedBy event={event} />
        <p className="text-xs text-muted-foreground">{t('review.readOnly')}</p>
      </section>
    );
  }

  const submit = async () => {
    try {
      await review.mutateAsync({ id: event.id, data: reviewBody(event, status, note) });
      toast.success(t('review.saved'), {
        description: SURVEILLANCE_EVENT_STATUS_LABELS[status === 'open' ? 'open' : status][locale],
      });
    } catch (error) {
      const problem = toApiProblem(error);
      toast.error(t('review.failed'), {
        description:
          problem.code === 'SURVEILLANCE_EVENT_NOT_FOUND'
            ? t('review.notFound')
            : problem.status === 403
              ? t('review.forbidden')
              : (problem.detail ?? problem.title),
      });
    }
  };

  return (
    <form
      aria-labelledby={`${id}-title`}
      className={cn('space-y-4', className)}
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardCheck className="size-4 text-primary" aria-hidden /> {t('review.title')}
        </h3>
        <EventStatusBadge status={event.status} />
      </div>
      <RadioGroup
        value={status}
        onValueChange={(value) => setStatus(value as ReviewStatus)}
        aria-label={t('review.verdict')}
        className="grid gap-2"
      >
        {REVIEW_STATUSES.map((option) => (
          <Label
            key={option}
            htmlFor={`${id}-${option}`}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-muted/50',
              status === option && 'border-primary/50 bg-primary/8',
            )}
          >
            <RadioGroupItem id={`${id}-${option}`} value={option} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{t(`review.options.${option}`)}</span>
              <span className="text-xs text-muted-foreground">
                {t(`review.options.${option}Hint`)}
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-note`}>{t('review.note')}</Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          maxLength={NOTE_MAX}
          rows={4}
          placeholder={t('review.notePlaceholder')}
          onChange={(changeEvent) => setNote(changeEvent.target.value)}
          aria-describedby={`${id}-note-hint`}
        />
        <p
          id={`${id}-note-hint`}
          className="flex justify-between gap-2 text-xs text-muted-foreground"
        >
          <span>{event.note ? t('review.noteKept') : t('review.noteHint')}</span>
          <span className="font-mono tabular-nums">
            {note.length}/{NOTE_MAX}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ReviewedBy event={event} />
        <Button type="submit" disabled={!changed || review.isPending}>
          {review.isPending && <Spinner />}
          {t('review.submit')}
        </Button>
      </div>
    </form>
  );
}

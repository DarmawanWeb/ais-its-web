import { CheckCircle2, CircleX, History, Loader2, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCiiControllerStartRecompute } from '@/shared/api/generated/emission/cii/cii';
import type { RecomputeJobDto } from '@/shared/api/generated/emission/model';
import { KeyValueList } from '@/shared/domain-ui/key-value-list';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { toast } from '@/shared/ui/sonner';
import { Spinner } from '@/shared/ui/spinner';

import { useInvalidateVessel, useRecomputeJob } from '../api/queries';
import { useCiiFormat } from '../hooks/use-cii-format';
import {
  fromLocalInputValue,
  parseJobError,
  RECOMPUTE_MAX_DAYS,
  recomputeRangeIssue,
  toLocalInputValue,
} from '../lib/recompute';
import { CiiProblemState } from './bits';

/**
 * Recomputation of a vessel's segments by replaying `AIS_POSITION` (super_admin only,
 * ≤ 7 days, `to` ≤ now). Starts the job and hands its id to the status card.
 */
export function RecomputeDialog({
  mmsi,
  open,
  onOpenChange,
  onStarted,
}: {
  mmsi: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: (job: RecomputeJobDto) => void;
}) {
  const { t } = useTranslation('cii');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-4 text-primary" aria-hidden /> {t('recompute.title')}
          </DialogTitle>
          <DialogDescription>
            {t('recompute.description', { days: RECOMPUTE_MAX_DAYS })}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted while open only: the range starts from "last 24 h" on every opening. */}
        <RecomputeForm mmsi={mmsi} onStarted={onStarted} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RecomputeForm({
  mmsi,
  onStarted,
  onClose,
}: {
  mmsi: number;
  onStarted: (job: RecomputeJobDto) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('cii');
  const [initial] = useState(() => new Date());
  const [from, setFrom] = useState(() =>
    toLocalInputValue(new Date(initial.getTime() - 24 * 3_600_000)),
  );
  const [to, setTo] = useState(() => toLocalInputValue(initial));
  const mutation = useCiiControllerStartRecompute();
  const issue =
    from && to
      ? recomputeRangeIssue(fromLocalInputValue(from), fromLocalInputValue(to))
      : 'invalid';

  const start = async () => {
    if (issue) return;
    try {
      const job = await mutation.mutateAsync({
        mmsi: String(mmsi),
        params: {
          from: fromLocalInputValue(from).toISOString(),
          to: fromLocalInputValue(to).toISOString(),
        },
      });
      toast.success(t('recompute.started'));
      onStarted(job);
      onClose();
    } catch {
      // Rendered below from mutation.error.
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void start();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cii-recompute-from">{t('recompute.from')}</Label>
          <Input
            id="cii-recompute-from"
            type="datetime-local"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            aria-invalid={!!issue && issue !== 'future' ? true : undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cii-recompute-to">{t('recompute.to')}</Label>
          <Input
            id="cii-recompute-to"
            type="datetime-local"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            aria-invalid={issue === 'future' || issue === 'order' ? true : undefined}
          />
        </div>
      </div>
      {issue && issue !== 'invalid' && (
        <p className="text-sm text-danger" role="alert">
          {t(`recompute.issues.${issue}`, { days: RECOMPUTE_MAX_DAYS })}
        </p>
      )}
      <Alert variant="warning">
        <History aria-hidden />
        <AlertTitle>{t('recompute.warningTitle')}</AlertTitle>
        <AlertDescription>{t('recompute.warning')}</AlertDescription>
      </Alert>
      {mutation.isError && <CiiProblemState error={mutation.error} size="sm" />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common:actions.cancel')}
        </Button>
        <Button type="submit" disabled={!!issue || mutation.isPending}>
          {mutation.isPending ? <Spinner /> : <RotateCcw />} {t('recompute.start')}
        </Button>
      </DialogFooter>
    </form>
  );
}

const STATUS_VARIANT = { running: 'info', succeeded: 'success', failed: 'danger' } as const;

/** Status of a recomputation job (polled while running); refreshes the figures on success. */
export function RecomputeJobCard({
  jobId,
  mmsi,
  onDismiss,
}: {
  jobId: string;
  mmsi: number;
  onDismiss: () => void;
}) {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  const query = useRecomputeJob(jobId);
  const invalidate = useInvalidateVessel();
  const notified = useRef<string | null>(null);
  const job = query.data;

  useEffect(() => {
    if (!job || job.status === 'running' || notified.current === job.id) return;
    notified.current = job.id;
    if (job.status === 'succeeded') {
      toast.success(t('recompute.succeeded', { segments: job.segments }));
      void invalidate(mmsi);
    } else {
      toast.error(t('recompute.failed'));
    }
  }, [job, mmsi, invalidate, t]);

  const error = parseJobError(job?.error);
  const Icon =
    !job || job.status === 'running'
      ? Loader2
      : job.status === 'succeeded'
        ? CheckCircle2
        : CircleX;

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-xs"
      aria-label={t('recompute.jobTitle')}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon
            className={`size-4 ${!job || job.status === 'running' ? 'animate-spin text-info' : job.status === 'succeeded' ? 'text-success' : 'text-danger'}`}
            aria-hidden
          />
          {t('recompute.jobTitle')}
          {job && (
            <Badge variant={STATUS_VARIANT[job.status]}>
              {t(`recompute.status.${job.status}`)}
            </Badge>
          )}
        </h2>
        {job && job.status !== 'running' && (
          <Button size="xs" variant="ghost" onClick={onDismiss}>
            {t('common:actions.close')}
          </Button>
        )}
      </div>
      {query.isError ? (
        <CiiProblemState error={query.error} size="sm" onRetry={() => void query.refetch()} />
      ) : job ? (
        <>
          <KeyValueList
            columns={3}
            dense
            items={[
              {
                key: 'range',
                label: t('recompute.range'),
                value: `${format.dateTime(job.from)} – ${format.dateTime(job.to)}`,
              },
              {
                key: 'replayed',
                label: t('recompute.replayed'),
                value: format.number(job.replayed),
                mono: true,
              },
              {
                key: 'segments',
                label: t('recompute.segments'),
                value: format.number(job.segments),
                mono: true,
              },
              {
                key: 'deleted',
                label: t('recompute.deleted'),
                value: format.number(job.deleted),
                mono: true,
              },
              {
                key: 'heartbeat',
                label: t('recompute.heartbeat'),
                value: format.relative(job.heartbeatAt),
              },
              {
                key: 'finished',
                label: t('recompute.finished'),
                value: job.finishedAt ? format.dateTime(job.finishedAt) : '—',
              },
            ]}
          />
          {error && (
            <Alert variant="destructive">
              <CircleX aria-hidden />
              <AlertTitle>
                {error.code
                  ? t(`recompute.errors.${error.code}`, { defaultValue: error.code })
                  : t('recompute.failed')}
              </AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
          <p className="font-mono text-[11px] text-muted-foreground">
            {t('recompute.jobId')} {job.id}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t('recompute.loading')}</p>
      )}
    </section>
  );
}

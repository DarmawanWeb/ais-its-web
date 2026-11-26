import { Pause, Play, Route, SkipBack } from 'lucide-react';
import { Slider as SliderPrimitive } from 'radix-ui';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { UnitValue } from '@/shared/domain-ui/values';
import { formatDateTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';
import { Switch } from '@/shared/ui/switch';
import { Label } from '@/shared/ui/label';

import { useLiveMapStore } from '../hooks/use-live-map-store';
import { localizeProblem } from '@/shared/api/problem-copy';
import { trackProblemCopies } from '../lib/problems';
import { positionAt, TRACK_RANGES, trackLengthNm, type TrackRange } from '../lib/track';
import { useSelectedTrack } from '../hooks/use-selected-track';

const SPEEDS = [60, 120, 600, 1800] as const;

/** Track history of the selected vessel with a playback slider (play/pause, speed). */
export function TrackControls() {
  const { t, i18n } = useTranslation('map');
  const { track, query, samples } = useSelectedTrack();
  const setTrack = useLiveMapStore((state) => state.setTrack);
  const first = samples[0];
  const last = samples[samples.length - 1];
  const time = track.time ?? last?.time ?? 0;
  const current = positionAt(samples, time);
  const frame = useRef<number | null>(null);

  // Playback: advance `speed` seconds of track per second of wall time.
  useEffect(() => {
    if (!track.playing || !first || !last) return;
    let previous = performance.now();
    const step = (now: number) => {
      const state = useLiveMapStore.getState().track;
      const at = state.time ?? first.time;
      const next = at + (now - previous) * state.speed;
      previous = now;
      if (next >= last.time) {
        setTrack({ time: last.time, playing: false });
        return;
      }
      setTrack({ time: next });
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [track.playing, first, last, setTrack]);

  return (
    <section aria-labelledby="track-title" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="track-title"
          className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          <Route className="size-3.5" aria-hidden /> {t('track.title')}
        </h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="track-enabled" className="text-xs text-muted-foreground">
            {t('track.show')}
          </Label>
          <Switch
            id="track-enabled"
            checked={track.enabled}
            onCheckedChange={(enabled) => setTrack({ enabled, playing: false })}
            data-testid="track-toggle"
          />
        </div>
      </div>
      {track.enabled && (
        <div className="space-y-3 rounded-lg border bg-background/40 p-3">
          <div className="flex items-center gap-2">
            <Select
              value={track.range}
              onValueChange={(range) => setTrack({ range: range as TrackRange, playing: false })}
            >
              <SelectTrigger size="sm" className="w-full" aria-label={t('track.range')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TRACK_RANGES) as TrackRange[]).map((range) => (
                  <SelectItem key={range} value={range}>
                    {t(`track.ranges.${range}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(track.speed)}
              onValueChange={(speed) => setTrack({ speed: Number(speed) })}
            >
              <SelectTrigger size="sm" className="w-24 shrink-0" aria-label={t('track.speed')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPEEDS.map((speed) => (
                  <SelectItem key={speed} value={String(speed)}>
                    ×{speed}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {query.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : query.isError ? (
            <ErrorState
              error={localizeProblem(query.error, trackProblemCopies(t))}
              onRetry={() => void query.refetch()}
              size="sm"
            />
          ) : samples.length < 2 || !first || !last ? (
            <p className="py-2 text-center text-xs text-muted-foreground">{t('track.empty')}</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label={t('track.restart')}
                  onClick={() => setTrack({ time: first.time, playing: false })}
                >
                  <SkipBack />
                </Button>
                <Button
                  size="icon-sm"
                  aria-label={track.playing ? t('track.pause') : t('track.play')}
                  onClick={() =>
                    setTrack({
                      playing: !track.playing,
                      ...(time >= last.time ? { time: first.time } : {}),
                    })
                  }
                  data-testid="track-play"
                >
                  {track.playing ? <Pause /> : <Play />}
                </Button>
                <SliderPrimitive.Root
                  className="relative flex h-5 flex-1 touch-none items-center select-none"
                  min={first.time}
                  max={last.time}
                  step={1_000}
                  value={[time]}
                  onValueChange={([value]) =>
                    setTrack({ time: value ?? last.time, playing: false })
                  }
                >
                  <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-muted">
                    <SliderPrimitive.Range className="absolute h-full bg-primary" />
                  </SliderPrimitive.Track>
                  <SliderPrimitive.Thumb
                    className="block size-4 cursor-grab rounded-full border-2 border-primary bg-surface shadow focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    aria-label={t('track.position')}
                    aria-valuetext={formatDateTime(time, i18n.language, 'dd MMM HH:mm:ss')}
                    data-testid="track-slider"
                  />
                </SliderPrimitive.Root>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">{t('track.time')}</dt>
                  <dd className="font-mono tabular-nums" data-testid="track-time">
                    {formatDateTime(time, i18n.language, 'dd MMM HH:mm')}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">SOG</dt>
                  <dd>
                    <UnitValue value={current?.sog ?? null} unit="knots" />
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-0.5 text-muted-foreground">
                    {t('track.distance')}
                    <MethodInfo methodId="geo.haversine_distance" />
                  </dt>
                  <dd>
                    <UnitValue value={trackLengthNm(samples)} unit="nm" digits={1} />
                  </dd>
                </div>
              </dl>
              <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                {t('track.points', { count: samples.length })} ·{' '}
                {query.data?.resolution === '1m'
                  ? t('track.resolution1m')
                  : t('track.resolutionRaw')}
                {query.data?.simplifyM ? (
                  <>
                    {' · '}
                    {t('track.simplified', { meters: query.data.simplifyM })}
                    <MethodInfo methodId="geo.track_simplification" />
                  </>
                ) : null}
              </p>
              {query.data?.truncated && (
                <p className="text-[11px] text-warning" role="status">
                  {t('track.truncated')}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

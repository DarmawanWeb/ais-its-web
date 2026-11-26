import { TripsLayer } from '@deck.gl/geo-layers';
import { LineLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { Crosshair, Pause, Play, RotateCcw, Route } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { UnitValue } from '@/shared/domain-ui/values';
import { MapLegend, MapView, useDeckLayers } from '@/shared/map';
import { formatDateTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import type { Rgba } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';

import { usePairTrack } from '../api/queries';
import type { LonLat } from '../lib/geo';
import {
  closestApproach,
  pairDistanceAt,
  positionAt,
  prepareReplay,
  type Replay,
  replayWindow,
} from '../lib/replay';
import { FitToPoints } from './maps/layers';

/** Track colours (chart tokens 1 and 8 of the dark theme: cyan and orange, CVD-distinct). */
const TRACK_COLORS: [Rgba, Rgba] = [
  [54, 208, 228, 255],
  [252, 146, 82, 255],
];
const TRAIL_S = 15 * 60;
const SPEEDS = [30, 60, 120, 300] as const;

interface ReplayTrip {
  index: number;
  path: LonLat[];
  timestamps: number[];
}

function ReplayLayers({ replay, time }: { replay: Replay; time: number }) {
  const trips = useMemo<ReplayTrip[]>(
    () =>
      replay.tracks.map((track, index) => ({
        index,
        path: track.path,
        // Seconds since the replay start: deck.gl keeps timestamps as 32-bit floats.
        timestamps: track.timestamps.map((value) => (value - replay.start) / 1000),
      })),
    [replay],
  );
  const current = useMemo(
    () =>
      replay.tracks
        .map((track, index) => ({ index, position: positionAt(track, time) }))
        .filter((item): item is { index: number; position: LonLat } => item.position !== null),
    [replay, time],
  );
  const layers = useMemo(
    () => [
      new PathLayer<ReplayTrip>({
        id: 'replay-paths',
        data: trips,
        getPath: (trip) => trip.path,
        getColor: (trip) => {
          const [r, g, b] = TRACK_COLORS[trip.index % 2]!;
          return [r, g, b, 70];
        },
        widthUnits: 'pixels',
        getWidth: 2,
        jointRounded: true,
        capRounded: true,
      }),
      new TripsLayer<ReplayTrip>({
        id: 'replay-trips',
        data: trips,
        getPath: (trip) => trip.path,
        getTimestamps: (trip) => trip.timestamps,
        getColor: (trip) => TRACK_COLORS[trip.index % 2]!,
        widthUnits: 'pixels',
        getWidth: 4,
        widthMinPixels: 3,
        trailLength: TRAIL_S,
        fadeTrail: true,
        currentTime: (time - replay.start) / 1000,
        jointRounded: true,
        capRounded: true,
      }),
      current.length === 2 &&
        new LineLayer<{ from: LonLat; to: LonLat }>({
          id: 'replay-gap',
          data: [{ from: current[0]!.position, to: current[1]!.position }],
          getSourcePosition: (line) => line.from,
          getTargetPosition: (line) => line.to,
          getColor: [255, 255, 255, 180],
          getWidth: 1.5,
        }),
      new ScatterplotLayer<{ index: number; position: LonLat }>({
        id: 'replay-vessels',
        data: current,
        getPosition: (item) => item.position,
        radiusUnits: 'pixels',
        getRadius: 7,
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 2,
        getFillColor: (item) => TRACK_COLORS[item.index % 2]!,
        getLineColor: [255, 255, 255, 230],
      }),
    ],
    [trips, current, replay.start, time],
  );
  useDeckLayers('transhipment-replay', layers, { order: 50 });
  return null;
}

/**
 * Replay of both tracks of a transhipment pair (`GET /ais/pairs/track`) around the analysed
 * window: animated trails, the vessels' interpolated positions with their distance, and a
 * scrubber on which the analysed window is marked. Play, pause, speed, jump to the closest
 * approach; fully keyboard operable (the scrubber is a native range input).
 */
export function PairReplay({
  mmsi1,
  mmsi2,
  names,
  windowStart,
  windowEnd,
  seekTo = null,
}: {
  mmsi1: number;
  mmsi2: number;
  names: [string, string];
  windowStart: string;
  windowEnd: string;
  /** Moves the replay to `at` (paused); a new `nonce` seeks again to the same time. */
  seekTo?: { at: string; nonce: number } | null;
}) {
  const { t, i18n } = useTranslation('surveillance');
  const id = useId();
  const range = useMemo(() => replayWindow(windowStart, windowEnd), [windowStart, windowEnd]);
  const pair = usePairTrack({ mmsi1, mmsi2, from: range.from, to: range.to });
  const replay = useMemo(() => prepareReplay(pair.data), [pair.data]);
  const [time, setTime] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  // A new seek request adjusts the replay state during render (no effect round trip).
  const [lastSeek, setLastSeek] = useState(seekTo);
  if (seekTo !== lastSeek) {
    setLastSeek(seekTo);
    if (seekTo) {
      setTime(Date.parse(seekTo.at));
      setPlaying(false);
    }
  }
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(120);
  const frame = useRef<number | null>(null);

  const start = replay?.start ?? Date.parse(range.from);
  const end = replay?.end ?? Date.parse(range.to);
  const now = Math.min(end, Math.max(start, time ?? Date.parse(windowStart)));

  const timeRef = useRef(now);
  useEffect(() => {
    timeRef.current = now;
  }, [now]);
  useEffect(() => {
    if (!playing || !replay) return;
    let last = performance.now();
    const tick = (stamp: number) => {
      const elapsed = stamp - last;
      last = stamp;
      const next = Math.min(replay.end, timeRef.current + elapsed * speed);
      timeRef.current = next;
      setTime(next);
      if (next >= replay.end) setPlaying(false);
      else frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [playing, replay, speed]);

  const closest = useMemo(() => (replay ? closestApproach(replay) : null), [replay]);
  const distance = replay ? pairDistanceAt(replay, now) : null;
  const fitPoints = useMemo(() => replay?.tracks.flatMap((track) => track.path) ?? [], [replay]);
  const span = Math.max(1, end - start);
  const windowLeft = ((Date.parse(windowStart) - start) / span) * 100;
  const windowWidth = ((Date.parse(windowEnd) - Date.parse(windowStart)) / span) * 100;
  const dt = (value: number) => formatDateTime(value, i18n.language, 'dd MMM HH:mm:ss');

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="overflow-hidden rounded-xl border bg-surface shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold">
          <Route className="size-4 text-primary" aria-hidden /> {t('replay.title')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t('replay.window', { from: dt(Date.parse(range.from)), to: dt(Date.parse(range.to)) })}
        </p>
      </div>
      <div className="relative h-[22rem] lg:h-[28rem]">
        <MapView ariaLabel={t('replay.mapLabel')}>
          {replay && <ReplayLayers replay={replay} time={now} />}
          <FitToPoints
            points={fitPoints}
            fitKey={`${mmsi1}:${mmsi2}:${range.from}`}
            maxZoom={15}
            padDeg={0.004}
            minSpanDeg={0.02}
          />
        </MapView>
        <div className="pointer-events-none absolute top-3 left-3 z-10 flex flex-col gap-2 *:pointer-events-auto">
          <div className="glass-panel rounded-lg border px-3 py-2 shadow-panel">
            <p className="text-[11px] text-muted-foreground">{t('replay.distance')}</p>
            <p className="flex items-center gap-1 text-lg font-semibold" aria-live="off">
              {distance === null ? '—' : <UnitValue value={distance} unit="m" />}
              <MethodInfo methodId="geo.haversine_distance" />
            </p>
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">{dt(now)}</p>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-9 left-3 z-10 *:pointer-events-auto">
          <MapLegend
            title={t('replay.legend')}
            items={[
              {
                label: names[0],
                color: `rgb(${TRACK_COLORS[0].slice(0, 3).join(',')})`,
                shape: 'line',
              },
              {
                label: names[1],
                color: `rgb(${TRACK_COLORS[1].slice(0, 3).join(',')})`,
                shape: 'line',
              },
              { label: t('replay.gapLine'), color: 'var(--foreground)', shape: 'line' },
            ]}
          />
        </div>
        {pair.isPending && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/40">
            <Skeleton className="h-10 w-48" />
            <span className="sr-only">{t('common:status.loading')}</span>
          </div>
        )}
        {pair.isError && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80">
            <ErrorState error={pair.error} onRetry={() => void pair.refetch()} size="sm" />
          </div>
        )}
        {pair.isSuccess && !replay && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80">
            <EmptyState
              icon={Route}
              title={t('replay.emptyTitle')}
              description={t('replay.emptyDescription')}
              size="sm"
            />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 border-t p-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            onClick={() => {
              if (!playing && now >= end) setTime(start);
              setPlaying((value) => !value);
            }}
            disabled={!replay}
            aria-label={playing ? t('replay.pause') : t('replay.play')}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setPlaying(false);
              setTime(start);
            }}
            disabled={!replay}
            aria-label={t('replay.restart')}
          >
            <RotateCcw />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!closest) return;
              setPlaying(false);
              setTime(closest.t);
            }}
            disabled={!closest}
          >
            <Crosshair /> {t('replay.closest')}
          </Button>
        </div>
        <div className="relative min-w-0 flex-1 py-2">
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted"
            aria-hidden
          >
            <div
              className="absolute h-full rounded-full bg-warning/50"
              style={{
                left: `${Math.max(0, windowLeft)}%`,
                width: `${Math.max(0.5, Math.min(100, windowWidth))}%`,
              }}
              title={t('replay.analysedWindow')}
            />
          </div>
          <input
            type="range"
            min={start}
            max={end}
            step={1000}
            value={now}
            disabled={!replay}
            onChange={(changeEvent) => {
              setPlaying(false);
              setTime(Number(changeEvent.target.value));
            }}
            aria-label={t('replay.scrubber')}
            aria-valuetext={dt(now)}
            className={cn(
              'relative w-full cursor-pointer appearance-none bg-transparent accent-primary',
              '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:bg-transparent',
            )}
          />
          <p className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{dt(start)}</span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-3 rounded-full bg-warning/50" aria-hidden />{' '}
              {t('replay.analysedWindow')}
            </span>
            <span>{dt(end)}</span>
          </p>
        </div>
        <Select
          value={String(speed)}
          onValueChange={(value) => setSpeed(Number(value) as (typeof SPEEDS)[number])}
        >
          <SelectTrigger size="sm" className="w-full sm:w-28" aria-label={t('replay.speed')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPEEDS.map((value) => (
              <SelectItem key={value} value={String(value)}>
                {t('replay.speedValue', { value })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}

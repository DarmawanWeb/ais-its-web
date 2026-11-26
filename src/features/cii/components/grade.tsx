import { CII_GRADE_LABELS } from '@darmawanweb/ais-its-contracts/domain';
import { useTranslation } from 'react-i18next';

import type { DdVectorDto } from '@/shared/api/generated/emission/model';
import { cn } from '@/shared/lib/utils';

import {
  type CiiGrade,
  domainBands,
  domainPosition,
  markerLayout,
  scaleDomain,
} from '../lib/grades';
import { useCiiFormat } from '../hooks/use-cii-format';
import { gradeClassName } from '@/shared/theme/grade';

function useLocale(): 'id' | 'en' {
  const { i18n } = useTranslation();
  return i18n.language === 'en' ? 'en' : 'id';
}

/** CII grade letter on its IMO colour, with the label (contracts) as accessible text. */
export function GradeChip({
  grade,
  size = 'md',
  showLabel = false,
  className,
}: {
  grade: CiiGrade | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('cii');
  const locale = useLocale();
  if (!grade) {
    return (
      <span className={cn('text-muted-foreground', className)}>
        —<span className="sr-only">{t('grade.none')}</span>
      </span>
    );
  }
  const label = CII_GRADE_LABELS[grade][locale];
  return (
    <span className={cn('inline-flex items-center gap-2', className)} title={label}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md font-bold shadow-xs ring-1 ring-black/10 ring-inset',
          gradeClassName(grade),
          size === 'sm' && 'size-5 text-[11px]',
          size === 'md' && 'size-7 text-sm',
          size === 'lg' && 'size-11 text-xl',
          size === 'xl' && 'size-16 rounded-xl text-3xl',
        )}
      >
        <span aria-hidden>{grade}</span>
        <span className="sr-only">{t('grade.aria', { grade, label })}</span>
      </span>
      {showLabel && <span className="text-sm text-muted-foreground">{label}</span>}
    </span>
  );
}

export interface ScaleMarker {
  value: number;
  label: string;
  tone?: 'primary' | 'foreground' | 'muted';
}

/** Colour classes of a scale marker's leader (`bg`) or caret (`border`). */
function markerTone(tone: ScaleMarker['tone'], kind: 'bg' | 'border'): string {
  if (tone === 'muted') return kind === 'bg' ? 'bg-muted-foreground' : 'border-t-muted-foreground';
  if (tone === 'foreground') return kind === 'bg' ? 'bg-foreground' : 'border-t-foreground';
  return kind === 'bg' ? 'bg-primary' : 'border-t-primary';
}

/** Height of one marker label row above the bar (rem). */
const ROW_REM = 1.75;

/**
 * The A–E rating scale of a year (bands d_i × required) with markers, e.g. the attained CII.
 * Bands carry their letter (identity never by colour alone) and 2 px gaps; boundary values are
 * printed under the bar. B–D are shown in full and A and E as open-ended margins; marker labels
 * never overlap (back to back or on two rows) and markers stop at the bar with a caret, so they
 * never hide a band letter (the required CII, rating 1, always lies inside band C).
 */
export function RatingScale({
  dd,
  markers,
  compact = false,
  className,
  ariaLabel,
}: {
  dd: DdVectorDto;
  markers: readonly ScaleMarker[];
  compact?: boolean;
  className?: string;
  ariaLabel: string;
}) {
  const format = useCiiFormat();
  const domain = scaleDomain(
    dd,
    markers.map((marker) => marker.value),
  );
  const bands = domainBands(dd, domain);
  const positions = markers.map((marker) => domainPosition(marker.value, domain));
  const layout = markerLayout(positions);
  const rows = layout.reduce((count, item) => Math.max(count, item.row + 1), 1);
  const width = domain.max - domain.min;
  return (
    <figure className={cn('min-w-0', className)} aria-label={ariaLabel} role="img">
      <div className="relative" style={{ paddingTop: compact ? 0 : `${rows * ROW_REM}rem` }}>
        <div className={cn('flex gap-0.5', compact ? 'h-2' : 'h-7')}>
          {bands.map((band) => (
            <div
              key={band.grade}
              className={cn(
                'flex items-center justify-center overflow-hidden text-xs font-bold first:rounded-l-md last:rounded-r-md',
                gradeClassName(band.grade),
              )}
              style={{ width: `${((band.to - band.from) / width) * 100}%` }}
              aria-hidden
            >
              {!compact && band.grade}
            </div>
          ))}
        </div>
        {markers.map((marker, index) => {
          const left = (positions[index] ?? 0) * 100;
          const { anchor, row } = layout[index] ?? { anchor: 'center', row: 0 };
          const shift = anchor === 'start' ? '0%' : anchor === 'end' ? '-100%' : '-50%';
          return (
            <div
              key={marker.label}
              className="pointer-events-none absolute top-0 bottom-0 w-0"
              style={{ left: `${left}%` }}
              aria-hidden
            >
              {!compact && (
                <span
                  className={cn(
                    'absolute rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold whitespace-nowrap shadow-xs',
                    marker.tone === 'muted'
                      ? 'border bg-elevated text-foreground'
                      : marker.tone === 'foreground'
                        ? 'bg-foreground text-background'
                        : 'bg-primary text-primary-foreground',
                  )}
                  style={{ top: `${row * ROW_REM}rem`, transform: `translateX(${shift})` }}
                >
                  {marker.label}
                </span>
              )}
              {compact ? (
                <span
                  className={cn(
                    'absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full ring-2 ring-surface',
                    markerTone(marker.tone, 'bg'),
                  )}
                />
              ) : (
                <>
                  {/* Leader from the label to the bar, then a caret pointing into the band. */}
                  <span
                    className={cn(
                      'absolute bottom-7 w-px -translate-x-1/2',
                      markerTone(marker.tone, 'bg'),
                    )}
                    style={{ top: `${row * ROW_REM + 1.375}rem` }}
                  />
                  <span
                    className={cn(
                      'absolute bottom-[calc(1.75rem-7px)] size-0 -translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent drop-shadow-sm',
                      markerTone(marker.tone, 'border'),
                    )}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
      {!compact && (
        <div
          className="relative mt-1.5 hidden h-4 font-mono text-[11px] text-muted-foreground sm:block"
          aria-hidden
        >
          {[dd.d1, dd.d2, dd.d3, dd.d4].map((edge, index) => (
            <span
              key={index}
              className="absolute -translate-x-1/2 tabular-nums"
              style={{ left: `${domainPosition(edge, domain) * 100}%` }}
            >
              {format.cii(edge)}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}

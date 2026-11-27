import {
  Activity,
  Calculator,
  CloudSun,
  Cpu,
  FilePenLine,
  type LucideIcon,
  Radio,
  SearchX,
  ShieldX,
  Ship,
  Waves,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { MethodChips as SharedMethodChips } from '@/shared/domain-ui/method-chips';
import { YearSelect as SharedYearSelect } from '@/shared/domain-ui/year-select';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { useEmissionMethodName } from '@/shared/methodology';

import { useCiiFormat } from '../hooks/use-cii-format';
import { ciiProblemKey } from '../lib/problems';
import type { FuelMethod } from '../lib/segments';

/** Unit of the attained/required CII: g CO2 per capacity-nautical mile. */
export function CiiUnit({ className }: { className?: string }) {
  const { t } = useTranslation('cii');
  return <span className={cn('text-muted-foreground', className)}>{t('units.cii')}</span>;
}

/** Sub navigation of the CII pages (fleet summary, reduction factors). */
export function CiiSubnav({ className }: { className?: string }) {
  const { t } = useTranslation('cii');
  const items = [
    { to: '/cii', label: t('subnav.fleet'), end: true },
    { to: '/cii/reduction-factors', label: t('subnav.reductionFactors'), end: false },
  ];
  return (
    <nav aria-label={t('subnav.label')} className={cn('flex flex-wrap gap-1', className)}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              isActive
                ? 'bg-primary/12 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Year picker (calendar years, UTC). */
/** The year picker of the CII pages (shared `YearSelect`, default id `cii-year`). */
export function YearSelect({
  id = 'cii-year',
  ...props
}: Omit<Parameters<typeof SharedYearSelect>[0], 'id' | 'autoLabel'> & { id?: string }) {
  return <SharedYearSelect id={id} {...props} />;
}

/** Where the figures of a year come from: voyage segments, or the manual / imported record. */
export function SourceBadge({
  source,
  className,
}: {
  source: 'segments' | 'manual' | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation('cii');
  if (!source) return <span className="text-muted-foreground">—</span>;
  if (source === 'manual') {
    return (
      <Badge variant="warning" className={className} title={t('source.manualHint')}>
        <FilePenLine aria-hidden /> {t('source.manual')}
      </Badge>
    );
  }
  return (
    <Badge variant="muted" className={className} title={t('source.segmentsHint')}>
      <Waves aria-hidden /> {t('source.segments')}
    </Badge>
  );
}

const METHOD_ICON: Record<FuelMethod | 'none', LucideIcon> = {
  telemetry: Radio,
  first_formula: Calculator,
  holtrop: CloudSun,
  none: Activity,
};

/** Fuel estimation method of a segment (telemetry, first formula, Holtrop; none = not counted). */
export function FuelMethodBadge({
  method,
  className,
}: {
  method: FuelMethod | 'none' | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation('cii');
  if (!method) return <span className="text-muted-foreground">—</span>;
  const Icon = METHOD_ICON[method];
  return (
    <Badge
      variant={method === 'none' ? 'muted' : method === 'telemetry' ? 'success' : 'primary'}
      className={className}
    >
      <Icon aria-hidden /> {t(`methods.${method}`)}
    </Badge>
  );
}

/** Chips naming the methodology entries behind a figure, each with its ⓘ source popover. */
export function MethodChips({
  methodIds,
  className,
  label,
}: {
  methodIds: readonly string[];
  className?: string;
  label?: ReactNode;
}) {
  const { t } = useTranslation('cii');
  const nameOf = useEmissionMethodName();
  return (
    <SharedMethodChips
      methodIds={methodIds}
      label={label ?? t('methodsUsed')}
      nameOf={nameOf}
      className={className}
    />
  );
}

/** "Updated live" chip shown after a `cii:updated` event reached the page. */
export function LiveUpdateBadge({ at }: { at: Date | null }) {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  if (!at) return null;
  return (
    <Badge variant="success" className="gap-1.5" role="status">
      <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden />
      {t('live.updated', { time: format.relative(at) })}
    </Badge>
  );
}

/** Translated state of an emission service problem; generic `<ErrorState>` otherwise. */
export function CiiProblemState({
  error,
  onRetry,
  action,
  size = 'default',
  values = {},
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  action?: ReactNode;
  size?: 'default' | 'sm';
  values?: Record<string, string | number>;
  className?: string;
}) {
  const { t } = useTranslation('cii');
  const key = ciiProblemKey(error);
  if (!key) return <ErrorState error={error} onRetry={onRetry} size={size} className={className} />;
  const title = t(`problems.${key}.title`, values);
  const description = t(`problems.${key}.description`, values);
  if (key === 'notAvailable') {
    return (
      <EmptyState
        icon={Ship}
        title={title}
        description={description}
        action={action}
        size={size}
        className={className}
      />
    );
  }
  if (key === 'forbidden' || key === 'superAdminRequired') {
    return (
      <EmptyState
        icon={ShieldX}
        title={title}
        description={description}
        size={size}
        className={className}
      />
    );
  }
  if (key === 'vesselNotFound' || key === 'manualNotFound' || key === 'jobNotFound') {
    return (
      <EmptyState
        icon={SearchX}
        title={title}
        description={description}
        action={action}
        size={size}
        className={className}
      />
    );
  }
  return (
    <ErrorState
      error={error}
      title={title}
      description={description}
      onRetry={onRetry}
      action={action}
      size={size}
      className={className}
    />
  );
}

/** Small "computed by" marker next to a figure title (icon + text, never colour alone). */
export function ComputedHint({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Cpu className="size-3" aria-hidden />
      {children}
    </span>
  );
}

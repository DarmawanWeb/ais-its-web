import {
  ALERT_DOMAIN_LABELS,
  ALERT_SEVERITY_LABELS,
  alertTypeLabel,
} from '@darmawanweb/ais-its-contracts/domain';
import { Globe2, Mail, Send, Ship, Webhook } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';

import { useVesselName, useZoneOptions } from '../api/rules-api';
import { useAppLanguage } from '@/shared/i18n';
import type { ChannelType } from '../lib/channels';
import { selectionFromRule } from '../lib/conditions';

const CHANNEL_ICONS: Record<ChannelType, typeof Mail> = {
  email: Mail,
  telegram: Send,
  webhook: Webhook,
};

export function ChannelIcon({ type, className }: { type: string; className?: string }) {
  const Icon = CHANNEL_ICONS[type as ChannelType] ?? Mail;
  return <Icon className={cn('size-3.5 shrink-0', className)} aria-hidden />;
}

/** Severity of a minimum threshold ("≥ Peringatan"). */
export function MinSeverityBadge({ severity }: { severity: string }) {
  const { t } = useTranslation('alert-rules');
  const locale = useAppLanguage();
  const label =
    severity in ALERT_SEVERITY_LABELS
      ? ALERT_SEVERITY_LABELS[severity as keyof typeof ALERT_SEVERITY_LABELS][locale]
      : severity;
  const variant = severity === 'critical' ? 'danger' : severity === 'warning' ? 'warning' : 'info';
  return (
    <Badge variant={variant}>
      <span className="sr-only">{t('card.minSeverity')}: </span>≥ {label}
    </Badge>
  );
}

/** Domains and types a rule watches, as chips ("Semua alert" when nothing restricts). */
export function ConditionChips({
  types,
  domains,
  className,
}: {
  types: readonly string[];
  domains: readonly string[];
  className?: string;
}) {
  const { t } = useTranslation('alert-rules');
  const locale = useAppLanguage();
  const selection = selectionFromRule({ types, domains });
  if (selection.domains.length === 0 && selection.types.length === 0) {
    return (
      <span className={cn('flex flex-wrap gap-1.5', className)}>
        <Badge variant="outline">{t('card.allAlerts')}</Badge>
      </span>
    );
  }
  return (
    <span className={cn('flex flex-wrap gap-1.5', className)}>
      {selection.domains.map((domain) => (
        <Badge key={domain} variant="primary">
          {ALERT_DOMAIN_LABELS[domain][locale]} · {t('card.allTypes')}
        </Badge>
      ))}
      {selection.types.map((type) => (
        <Badge key={type} variant="outline">
          {alertTypeLabel(type, locale)}
        </Badge>
      ))}
    </span>
  );
}

function VesselChip({ mmsi }: { mmsi: number }) {
  const name = useVesselName(mmsi);
  return (
    <Badge variant="muted" className="max-w-56">
      <Ship aria-hidden />
      <span className="truncate">{name ?? mmsi}</span>
      {name && <span className="font-mono text-[10px] tracking-tight">{mmsi}</span>}
    </Badge>
  );
}

/** The vessel filter of a rule (first chips, then "+N"). */
export function VesselChips({ mmsi, max = 3 }: { mmsi: readonly number[]; max?: number }) {
  const { t } = useTranslation('alert-rules');
  if (mmsi.length === 0)
    return <span className="text-muted-foreground">{t('card.anyVessel')}</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {mmsi.slice(0, max).map((value) => (
        <VesselChip key={value} mmsi={value} />
      ))}
      {mmsi.length > max && <Badge variant="muted">+{mmsi.length - max}</Badge>}
    </span>
  );
}

/** The zone filter of a rule, by zone name. */
export function ZoneChips({ zoneIds, max = 3 }: { zoneIds: readonly string[]; max?: number }) {
  const { t } = useTranslation('alert-rules');
  const zones = useZoneOptions();
  if (zoneIds.length === 0)
    return <span className="text-muted-foreground">{t('card.anyZone')}</span>;
  const names = new Map((zones.data?.data ?? []).map((zone) => [zone.id, zone.name]));
  return (
    <span className="flex flex-wrap gap-1.5">
      {zoneIds.slice(0, max).map((id) => (
        <Badge key={id} variant="muted" className="max-w-56">
          <Globe2 aria-hidden />
          <span className="truncate">{names.get(id) ?? id.slice(0, 8)}</span>
        </Badge>
      ))}
      {zoneIds.length > max && <Badge variant="muted">+{zoneIds.length - max}</Badge>}
    </span>
  );
}

export function ScopeBadge({ scope, ...props }: { scope: string } & ComponentProps<typeof Badge>) {
  const { t } = useTranslation('alert-rules');
  return (
    <Badge variant={scope === 'all' ? 'info' : 'outline'} {...props}>
      {scope === 'all' ? <Globe2 aria-hidden /> : <Ship aria-hidden />}
      {t(`scope.${scope === 'all' ? 'all' : 'org'}`)}
    </Badge>
  );
}

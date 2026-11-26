import { ZONE_KIND_LABELS, isZoneKind } from '@darmawanweb/ais-its-contracts/domain';
import { Building2, Globe2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/shared/auth';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';

import { kindCss } from '../lib/kind-style';

/**
 * Zone kind (contracts labels) with its map colour swatch; `wrap` lets long labels take a second
 * line instead of being cut.
 */
export function ZoneKindBadge({
  kind,
  className,
  wrap = false,
}: {
  kind: string;
  className?: string;
  wrap?: boolean;
}) {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const label = isZoneKind(kind) ? ZONE_KIND_LABELS[kind][locale] : kind;
  return (
    <span
      className={cn(
        'inline-flex min-w-0 gap-1.5 text-sm',
        wrap ? 'items-start whitespace-normal' : 'items-center',
        className,
      )}
    >
      <span
        className={cn('size-2.5 shrink-0 rounded-sm ring-1 ring-black/10', wrap && 'mt-[5px]')}
        style={{ background: kindCss(kind), boxShadow: `0 0 0 3px ${kindCss(kind, 0.18)}` }}
        aria-hidden
      />
      <span className={wrap ? 'min-w-0' : 'truncate'} title={wrap ? undefined : label}>
        {label}
      </span>
    </span>
  );
}

/** Global zone (shared by every tenant) or organization zone (tenant-private). */
export function ZoneScopeBadge({ global, orgId }: { global: boolean; orgId: string | null }) {
  const { t } = useTranslation('zones');
  const { orgId: activeOrg, memberships } = useSession();
  if (global) {
    return (
      <Badge variant="primary" className="gap-1">
        <Globe2 className="size-3" aria-hidden /> {t('scope.global')}
      </Badge>
    );
  }
  const membership = memberships.find((item) => item.orgId === orgId);
  const label =
    orgId === activeOrg ? t('scope.yourOrg') : (membership?.orgName ?? t('scope.otherOrg'));
  return (
    <Badge variant="muted" className="max-w-44 gap-1" title={orgId ?? undefined}>
      <Building2 className="size-3 shrink-0" aria-hidden />{' '}
      <span className="truncate">{label}</span>
    </Badge>
  );
}

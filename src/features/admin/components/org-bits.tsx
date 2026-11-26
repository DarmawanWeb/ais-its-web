import { ROLE_LABELS, isRole } from '@darmawanweb/ais-its-contracts/auth';
import { Ship } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';

import { useAppLanguage } from '@/shared/i18n';
import { KIND_ICONS } from '../lib/org-kinds';

const KIND_VARIANTS = {
  shipping_company: 'primary',
  authority: 'info',
  research: 'success',
  platform: 'warning',
} as const;

/** Kind of an organization with its icon. */
export function OrgKindBadge({ kind, className }: { kind: string; className?: string }) {
  const { t } = useTranslation('admin');
  const Icon = KIND_ICONS[kind] ?? Ship;
  const variant = KIND_VARIANTS[kind as keyof typeof KIND_VARIANTS] ?? 'outline';
  return (
    <Badge variant={variant} className={className}>
      <Icon aria-hidden /> {t(`orgKinds.${kind}`, { defaultValue: kind })}
    </Badge>
  );
}

/** Role of a member (contracts labels). */
export function RoleBadge({ role, className }: { role: string; className?: string }) {
  const locale = useAppLanguage();
  return (
    <Badge variant={role === 'org_admin' ? 'primary' : 'outline'} className={className}>
      {isRole(role) ? ROLE_LABELS[role][locale] : role}
    </Badge>
  );
}

const STATUS_VARIANTS = { active: 'success', invited: 'info', disabled: 'muted' } as const;

/** Account status (active / invited / disabled). */
export function UserStatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation('admin');
  return (
    <Badge
      variant={STATUS_VARIANTS[status as keyof typeof STATUS_VARIANTS] ?? 'outline'}
      className={cn(className)}
    >
      {t(`userStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
}

import {
  Archive,
  CheckCircle2,
  CircleDashed,
  Clock,
  type LucideIcon,
  PenLine,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/shared/ui/badge';

type Variant = 'success' | 'muted' | 'info' | 'warning' | 'primary';

const STATUS: Record<string, { variant: Variant; icon: LucideIcon }> = {
  implemented: { variant: 'success', icon: CheckCircle2 },
  not_implemented: { variant: 'muted', icon: CircleDashed },
  planned: { variant: 'info', icon: Clock },
  deprecated: { variant: 'muted', icon: Archive },
};

/** Lifecycle status of a method (open vocabulary: unknown values are shown as is). */
export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation('methodology');
  const known = STATUS[status];
  const Icon = known?.icon ?? CircleDashed;
  return (
    <Badge variant={known?.variant ?? 'muted'}>
      <Icon aria-hidden /> {t(`status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

const VERIFICATION: Record<string, { variant: Variant; icon: LucideIcon }> = {
  verified: { variant: 'success', icon: ShieldCheck },
  corrected: { variant: 'info', icon: PenLine },
  partially_verified: { variant: 'warning', icon: ShieldQuestion },
  unverified: { variant: 'warning', icon: ShieldAlert },
};

/** How far a reference was checked against its source (verified, corrected, unverified…). */
export function VerificationBadge({ verification }: { verification: string }) {
  const { t } = useTranslation('methodology');
  const known = VERIFICATION[verification];
  const Icon = known?.icon ?? ShieldQuestion;
  return (
    <Badge
      variant={known?.variant ?? 'muted'}
      title={t(`verification.${verification}Hint`, { defaultValue: '' })}
    >
      <Icon aria-hidden /> {t(`verification.${verification}`, { defaultValue: verification })}
    </Badge>
  );
}

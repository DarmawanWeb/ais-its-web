import { ROLE_LABELS, isRole } from '@darmawanweb/ais-its-contracts/auth';
import { Building2, Clock3, ShieldAlert, ShieldCheck, UserRoundCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { MeDto } from '@/shared/api/generated/auth/model';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/format';
import { Avatar, AvatarFallback, initials } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';

import { useAppLanguage } from '@/shared/i18n';

function HeroFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background/60 text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

/** Identity card of the signed-in account: avatar, name, roles, MFA and the active organization. */
export function ProfileHero({ me }: { me: MeDto }) {
  const { t, i18n } = useTranslation('profile');
  const locale = useAppLanguage();
  const activeOrg = me.memberships.find((m) => m.orgId === me.activeOrgId);
  const roles = me.roles.filter(isRole);

  return (
    <section
      aria-label={t('hero.label')}
      className="relative overflow-hidden rounded-xl border bg-surface shadow-xs"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_0%,var(--color-primary)_0%,transparent_45%)] opacity-[0.06] dark:opacity-[0.13]"
      />
      <div className="relative flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-16 ring-4 ring-primary/15">
            <AvatarFallback className="text-lg">{initials(me.name || me.email)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1.5">
            <p className="truncate text-lg font-semibold tracking-tight" data-testid="profile-name">
              {me.name || me.email}
            </p>
            <p className="truncate text-sm text-muted-foreground">{me.email}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {roles.map((role) => (
                <Badge key={role} variant={role === 'super_admin' ? 'info' : 'primary'}>
                  {ROLE_LABELS[role][locale]}
                </Badge>
              ))}
              {me.mfaEnabled ? (
                <Badge variant="success">
                  <ShieldCheck aria-hidden /> {t('hero.mfaOn')}
                </Badge>
              ) : (
                <Badge variant="warning">
                  <ShieldAlert aria-hidden /> {t('hero.mfaOff')}
                </Badge>
              )}
              {me.status !== 'active' && <Badge variant="muted">{t(`status.${me.status}`)}</Badge>}
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:min-w-[34rem]">
          <HeroFact
            icon={Building2}
            label={t('hero.activeOrg')}
            value={activeOrg?.orgName ?? t('common:shell.organization.platform')}
          />
          <HeroFact
            icon={Clock3}
            label={t('hero.lastLogin')}
            value={
              me.lastLoginAt ? (
                <time
                  dateTime={me.lastLoginAt}
                  title={formatDateTime(me.lastLoginAt, i18n.language)}
                >
                  {formatRelativeTime(me.lastLoginAt, i18n.language)}
                </time>
              ) : (
                t('hero.never')
              )
            }
          />
          <HeroFact
            icon={UserRoundCheck}
            label={t('hero.memberSince')}
            value={formatDateTime(me.createdAt, i18n.language, 'dd MMM yyyy')}
          />
        </div>
      </div>
    </section>
  );
}

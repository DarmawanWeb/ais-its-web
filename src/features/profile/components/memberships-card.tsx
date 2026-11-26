import { ROLE_LABELS, isRole } from '@darmawanweb/ais-its-contracts/auth';
import { useMutation } from '@tanstack/react-query';
import { ArrowRightLeft, Building2, CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { MembershipDto } from '@/shared/api/generated/auth/model';
import { switchOrganization } from '@/shared/auth';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { Section } from '@/shared/domain-ui/section';
import { formatDateTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback, initials } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/sonner';

import { useAppLanguage } from '@/shared/i18n';
import { problemMessage } from '@/shared/api/problem-copy';

/** Organizations the account belongs to, with the role in each and switching the active one. */
export function MembershipsCard({
  memberships,
  activeOrgId,
}: {
  memberships: readonly MembershipDto[];
  activeOrgId: string | null;
}) {
  const { t, i18n } = useTranslation('profile');
  const locale = useAppLanguage();
  const switchOrg = useMutation({
    mutationFn: (orgId: string) => switchOrganization(orgId),
    onSuccess: (_claims, orgId) => {
      const name = memberships.find((m) => m.orgId === orgId)?.orgName ?? orgId;
      toast.success(t('common:shell.organization.switched', { name }));
    },
    onError: (error) =>
      toast.error(t('common:shell.organization.failed'), { description: problemMessage(t, error) }),
  });

  return (
    <Section title={t('memberships.title')} description={t('memberships.description')}>
      {memberships.length === 0 ? (
        <EmptyState
          size="sm"
          icon={Building2}
          title={t('memberships.empty')}
          description={t('memberships.emptyHint')}
        />
      ) : (
        <ul className="space-y-2" aria-label={t('memberships.listLabel')}>
          {memberships.map((membership) => {
            const active = membership.orgId === activeOrgId;
            const switching = switchOrg.isPending && switchOrg.variables === membership.orgId;
            return (
              <li
                key={membership.orgId}
                className={cn(
                  'flex gap-3 rounded-lg border p-3',
                  // A ring, not a tint: the badges inside keep their contrast in the light theme.
                  active
                    ? 'border-primary/60 bg-surface ring-1 ring-primary/25'
                    : 'bg-background/40',
                )}
                aria-current={active ? 'true' : undefined}
              >
                <Avatar className="size-9 shrink-0 rounded-md">
                  <AvatarFallback className="rounded-md">
                    {initials(membership.orgName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={membership.orgName}>
                      {membership.orgName}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{t(`orgKinds.${membership.orgKind}`)}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {t('memberships.joined', {
                          date: formatDateTime(membership.joinedAt, i18n.language, 'dd MMM yyyy'),
                        })}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">
                      {isRole(membership.role)
                        ? ROLE_LABELS[membership.role][locale]
                        : membership.role}
                    </Badge>
                    {active ? (
                      <Badge variant="success">
                        <CircleCheck aria-hidden /> {t('memberships.active')}
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="xs"
                        className="ml-auto"
                        disabled={switchOrg.isPending}
                        onClick={() => switchOrg.mutate(membership.orgId)}
                      >
                        {switching ? <Spinner /> : <ArrowRightLeft />} {t('memberships.switch')}
                        <span className="sr-only">: {membership.orgName}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

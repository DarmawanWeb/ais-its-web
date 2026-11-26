import { LogOut, Monitor, MonitorSmartphone, Smartphone, Tablet, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import type { MembershipDto, SessionDto } from '@/shared/api/generated/auth/model';
import { AUTH_PATHS, logout } from '@/shared/auth';
import { ConfirmDialog } from '@/shared/domain-ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { Section } from '@/shared/domain-ui/section';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';

import { useRevokeSessions, useSessions } from '../api/profile-api';
import { problemMessage } from '@/shared/api/problem-copy';
import { type DeviceKind, parseUserAgent, sortSessions } from '../lib/sessions';

const DEVICE_ICONS: Record<DeviceKind, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: MonitorSmartphone,
};

function SessionRow({
  session,
  orgName,
  onRevoke,
  onSignOut,
}: {
  session: SessionDto;
  orgName: string | null;
  onRevoke: () => void;
  onSignOut: () => void;
}) {
  const { t, i18n } = useTranslation('profile');
  const agent = parseUserAgent(session.userAgent);
  const Icon = DEVICE_ICONS[agent.device];
  const title =
    agent.browser && agent.os
      ? t('sessions.browserOn', { browser: agent.browser, os: agent.os })
      : (agent.browser ?? agent.os ?? t('sessions.unknownDevice'));

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-3.5 sm:flex-row sm:items-center',
        session.current ? 'border-primary/50 bg-primary/8' : 'bg-background/40',
      )}
      data-testid={session.current ? 'session-current' : 'session-other'}
      aria-current={session.current ? 'true' : undefined}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg border',
          session.current
            ? 'border-primary/40 bg-primary/12 text-primary'
            : 'text-muted-foreground',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span className="truncate">{title}</span>
          {session.current && <Badge variant="primary">{t('sessions.current')}</Badge>}
        </p>
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>
            {t('sessions.ip')}: <span className="font-mono">{session.ip ?? '—'}</span>
          </span>
          <span>
            {t('sessions.organization')}: {orgName ?? t('common:shell.organization.none')}
          </span>
          <span title={formatDateTime(session.createdAt, i18n.language)}>
            {t('sessions.created', { date: formatDateTime(session.createdAt, i18n.language) })}
          </span>
          <span title={formatDateTime(session.lastUsedAt, i18n.language)}>
            {t('sessions.lastUsed', {
              time: formatRelativeTime(session.lastUsedAt, i18n.language),
            })}
          </span>
        </p>
      </div>
      {session.current ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onSignOut}
          className="shrink-0 self-start sm:self-center"
        >
          <LogOut /> {t('sessions.signOut')}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRevoke}
          className="shrink-0 self-start text-danger hover:bg-danger/10 hover:text-danger sm:self-center"
        >
          <Trash2 /> {t('sessions.revoke')}
          <span className="sr-only">: {title}</span>
        </Button>
      )}
    </li>
  );
}

/** Active sessions of the account (GET /auth/sessions) with revocation; this session first. */
export function SessionsCard({ memberships }: { memberships: readonly MembershipDto[] }) {
  const { t } = useTranslation('profile');
  const navigate = useNavigate();
  const sessions = useSessions();
  const revoke = useRevokeSessions();
  const [pending, setPending] = useState<{ ids: string[]; all: boolean } | null>(null);
  const list = sortSessions(sessions.data?.data ?? []);
  const others = list.filter((session) => !session.current);
  const orgName = (orgId: string | null) =>
    orgId ? (memberships.find((m) => m.orgId === orgId)?.orgName ?? orgId.slice(0, 8)) : null;

  const confirmRevoke = async () => {
    if (!pending) return;
    try {
      const count = await revoke.mutateAsync(pending.ids);
      toast.success(t('sessions.revoked', { count }));
    } catch (error) {
      toast.error(t('sessions.revokeFailed'), { description: problemMessage(t, error) });
    } finally {
      setPending(null);
    }
  };

  const signOut = () => {
    // The local session ends at once; the revocation finishes in the background (foundation).
    void logout();
    void navigate(AUTH_PATHS.login, { replace: true });
  };

  return (
    <Section
      title={t('sessions.title')}
      description={t('sessions.description')}
      actions={
        others.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPending({ ids: others.map((s) => s.id), all: true })}
          >
            <LogOut /> {t('sessions.revokeOthers')}
          </Button>
        )
      }
    >
      {sessions.isPending ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-[4.5rem] w-full rounded-lg" />
          ))}
        </div>
      ) : sessions.isError ? (
        <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} size="sm" />
      ) : list.length === 0 ? (
        <EmptyState size="sm" title={t('sessions.empty')} description={t('sessions.emptyHint')} />
      ) : (
        <ul className="space-y-2" aria-label={t('sessions.listLabel')}>
          {list.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              orgName={orgName(session.orgId)}
              onRevoke={() => setPending({ ids: [session.id], all: false })}
              onSignOut={signOut}
            />
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.all ? t('sessions.confirmOthersTitle') : t('sessions.confirmTitle')}
        description={
          pending?.all
            ? t('sessions.confirmOthersDescription', { count: pending.ids.length })
            : t('sessions.confirmDescription')
        }
        confirmLabel={pending?.all ? t('sessions.revokeOthers') : t('sessions.revoke')}
        destructive
        onConfirm={confirmRevoke}
      />
    </Section>
  );
}

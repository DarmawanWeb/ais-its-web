import { ROLE_LABELS } from '@darmawanweb/ais-its-contracts/auth';
import { UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { usePermissions, useSession } from '@/shared/auth/hooks';
import { useSessionStore } from '@/shared/auth/session';
import { KeyValueList } from '@/shared/domain-ui/key-value-list';
import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';
import { Section } from '@/shared/domain-ui/section';
import { formatDateTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';

/** Profile (scaffold): session details; password/MFA/sessions forms come next. */
export function ProfilePage() {
  const { t, i18n } = useTranslation('profile');
  const session = useSession();
  const permissions = usePermissions();
  const expiresAt = useSessionStore((state) => state.expiresAt);
  const locale = i18n.language === 'en' ? 'en' : 'id';

  return (
    <PlaceholderPage
      icon={UserRound}
      title={t('title')}
      description={t('description')}
      capabilities={t('capabilities', { returnObjects: true }) as string[]}
    >
      <Section title={t('account.title')}>
        <KeyValueList
          columns={2}
          items={[
            { label: t('account.name'), value: session.name || '—' },
            { label: t('account.email'), value: session.email || '—' },
            { label: t('account.userId'), value: session.userId, mono: true },
            {
              label: t('account.organization'),
              value:
                session.activeMembership?.orgName ??
                session.orgId ??
                t('common:shell.organization.platform'),
            },
            {
              label: t('account.roles'),
              value: (
                <span className="flex flex-wrap gap-1">
                  {session.roles.map((role) => (
                    <Badge key={role} variant="primary">
                      {ROLE_LABELS[role][locale]}
                    </Badge>
                  ))}
                </span>
              ),
            },
            { label: t('account.permissions'), value: permissions.size, mono: true },
            {
              label: t('account.sessionExpires'),
              value: formatDateTime(expiresAt, i18n.language, 'dd MMM yyyy HH:mm:ss'),
            },
          ]}
        />
      </Section>
    </PlaceholderPage>
  );
}

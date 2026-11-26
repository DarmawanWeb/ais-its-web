import { UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/domain-ui/feedback';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { Skeleton } from '@/shared/ui/skeleton';

import { useProfile } from '../api/profile-api';
import { AccountCard } from '../components/account-card';
import { MembershipsCard } from '../components/memberships-card';
import { MfaCard } from '../components/mfa-card';
import { PasswordCard } from '../components/password-card';
import { PreferencesCard } from '../components/preferences-card';
import { ProfileHero } from '../components/profile-hero';
import { SessionsCard } from '../components/sessions-card';

function ProfileSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    </div>
  );
}

/** Profile & security: account, preferences, password, MFA, sessions and memberships. */
export function ProfilePage() {
  const { t } = useTranslation('profile');
  const profile = useProfile();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        icon={UserRound}
      />
      {profile.isPending ? (
        <ProfileSkeleton />
      ) : profile.isError ? (
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      ) : (
        <>
          <ProfileHero me={profile.data} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex min-w-0 flex-col gap-6">
              <AccountCard me={profile.data} />
              <PasswordCard />
              <MfaCard enabled={profile.data.mfaEnabled} />
              <SessionsCard memberships={profile.data.memberships} />
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              <MembershipsCard
                memberships={profile.data.memberships}
                activeOrgId={profile.data.activeOrgId}
              />
              <PreferencesCard />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Button, Icon, Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DoctorProfileCompletionForm } from '#components/client/doctor-profile/doctor-profile-completion-form';
import { EmptyState } from '#components/shared/empty-state';
import { endSession } from '#lib/auth/end-session';
import { useOwnDoctorProfile } from '#lib/doctor-profile/use-own-doctor-profile';

type DoctorProfileCompletionPanelProps = {
  /** Already checked to stay inside the doctor shell. */
  nextPath: string;
};

/**
 * The first-run dress of the doctor's profile (P20-T02): why they are being
 * asked, the form, and a way out. Sign-out lives here rather than in a shell
 * menu because the shell is stripped down until the profile is complete.
 */
export function DoctorProfileCompletionPanel({ nextPath }: DoctorProfileCompletionPanelProps) {
  const t = useTranslations('clinical');
  const queryClient = useQueryClient();
  const profileQuery = useOwnDoctorProfile();
  const isLoadError = profileQuery.isError && !profileQuery.hasNoProfile;
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold text-slate-900">
          {t('profileCompletion.title')}
        </h1>
        <p className="text-sm text-slate-600">{t('profileCompletion.intro')}</p>
      </div>
      {profileQuery.isPending ? <Skeleton className="h-96 w-full rounded-xl" /> : null}
      {isLoadError ? (
        <EmptyState
          icon="error"
          title={t('ownProfile.loadErrorTitle')}
          description={t('ownProfile.loadErrorDescription')}
        />
      ) : null}
      {!profileQuery.isPending && !isLoadError ? (
        <DoctorProfileCompletionForm doctor={profileQuery.doctor} nextPath={nextPath} />
      ) : null}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={() => void endSession('LOGOUT', queryClient)}
        >
          <Icon name="logout" size={16} />
          {t('profileCompletion.signOut')}
        </Button>
      </div>
    </div>
  );
}

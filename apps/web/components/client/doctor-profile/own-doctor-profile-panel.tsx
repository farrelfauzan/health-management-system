'use client';

import { Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DoctorLicensesCard } from '#components/client/doctors/doctor-licenses-card';
import { OwnDoctorProfileClinicCard } from '#components/client/doctor-profile/own-doctor-profile-clinic-card';
import { OwnDoctorProfileForm } from '#components/client/doctor-profile/own-doctor-profile-form';
import { EmptyState } from '#components/shared/empty-state';
import { PageHeader } from '#components/shared/page-header';
import { useOwnDoctorProfile } from '#lib/doctor-profile/use-own-doctor-profile';
import { useShellBreadcrumbRoot } from '#lib/navigation/use-shell-breadcrumb-root';

/**
 * The doctor's own profile (P20-T03): the fields that are theirs as a form,
 * and what the clinic asserts about them read-only beside it, so it is plain
 * which is which and who to ask about the rest (D-025).
 */
export function OwnDoctorProfilePanel() {
  const t = useTranslations('clinical');
  const root = useShellBreadcrumbRoot();
  const profileQuery = useOwnDoctorProfile();
  const header = (
    <PageHeader
      title={t('ownProfile.title')}
      subtitle={t('ownProfile.subtitle')}
      breadcrumbs={[root, { label: t('ownProfile.title') }]}
    />
  );
  if (profileQuery.isPending) {
    return (
      <div className="space-y-6">
        {header}
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }
  if (!profileQuery.doctor) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={profileQuery.hasNoProfile ? 'person_off' : 'error'}
          title={t(
            profileQuery.hasNoProfile ? 'ownProfile.noProfileTitle' : 'ownProfile.loadErrorTitle',
          )}
          description={t(
            profileQuery.hasNoProfile
              ? 'ownProfile.noProfileDescription'
              : 'ownProfile.loadErrorDescription',
          )}
        />
      </div>
    );
  }
  const doctor = profileQuery.doctor;
  return (
    <div className="space-y-6">
      {header}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Keyed on the save time, so a refetch after saving re-seeds the
              form from what the server now holds. */}
          <OwnDoctorProfileForm key={doctor.updatedAt} doctor={doctor} />
        </div>
        <div className="space-y-6">
          <OwnDoctorProfileClinicCard doctor={doctor} />
          <DoctorLicensesCard licenses={doctor.licenses} />
        </div>
      </div>
    </div>
  );
}

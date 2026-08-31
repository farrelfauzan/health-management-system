'use client';

import { Card, CardContent, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicProfileForm } from '#components/client/clinic-profile/clinic-profile-form';
import { isProfileNotConfiguredError } from '#lib/clinic-profile/is-profile-not-configured-error';
import { useClinicProfile } from '#lib/clinic-profile/use-clinic-profile';

/**
 * The Clinic profile tab.
 *
 * A 404 from the read is not an error here — it is the state every clinic
 * starts in — so it renders the empty form rather than a failure. Anything
 * else is a real fault and says so, because an administrator who is shown a
 * blank form when the API is down would save it and believe they had
 * configured the clinic.
 */
export function ClinicProfilePanel() {
  const t = useTranslations('operations.administration.clinicProfile');
  const ability = useAbility();
  const canWrite = ability.can('write', 'ClinicProfile');
  const profileQuery = useClinicProfile();

  if (profileQuery.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-slate-500">{t('states.loading')}</CardContent>
      </Card>
    );
  }
  if (profileQuery.isError && !isProfileNotConfiguredError(profileQuery.error)) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-red-600">{t('states.loadFailed')}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t('title')}</h2>
        <p className="text-sm text-slate-500">{t('subtitle')}</p>
      </div>
      <ClinicProfileForm profile={profileQuery.data ?? null} canWrite={canWrite} />
    </div>
  );
}

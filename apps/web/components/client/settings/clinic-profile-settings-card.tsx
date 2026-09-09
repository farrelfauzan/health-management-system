'use client';

import { useTranslations } from 'next-intl';

import { SettingsHubCard } from '#components/client/settings/settings-hub-card';
import { isProfileNotConfiguredError } from '#lib/clinic-profile/is-profile-not-configured-error';
import { useClinicProfile } from '#lib/clinic-profile/use-clinic-profile';

type ClinicProfileSettingsCardProps = {
  href: string;
  icon: string;
};

/**
 * The clinic profile card, with the one attention state the hub starts with
 * (SJ-156): no profile row yet. The API answers 404 until the singleton
 * exists, and that answer is the fact this card is here to surface — its
 * absence silently breaks invoice and lab-report rendering.
 */
export function ClinicProfileSettingsCard({ href, icon }: ClinicProfileSettingsCardProps) {
  const t = useTranslations('operations.settings');
  const profileQuery = useClinicProfile();
  const isMissing = profileQuery.isError && isProfileNotConfiguredError(profileQuery.error);

  return (
    <SettingsHubCard
      cardKey="clinicProfile"
      href={href}
      icon={icon}
      attention={isMissing ? t('cards.clinicProfile.attention') : null}
    />
  );
}

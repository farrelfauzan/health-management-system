import type { SpecialtyInUseDetails } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import type { SpecialtyErrorMessages } from '#lib/specialties/resolve-specialty-error-message';

/** The poli screen's refusal copy, in the reader's locale. */
export function useSpecialtyErrorMessages(): SpecialtyErrorMessages {
  const t = useTranslations('operations.specialties');
  return {
    nameTaken: t('nameTaken'),
    inUse: ({ activeClinicianCount, activeTariffCount }: SpecialtyInUseDetails) =>
      t('inUse', {
        clinicians: activeClinicianCount,
        tariffs: activeTariffCount,
        separator: activeClinicianCount > 0 && activeTariffCount > 0 ? t('inUseSeparator') : '',
      }),
    fallback: t('saveError'),
  };
}

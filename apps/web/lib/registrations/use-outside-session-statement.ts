'use client';

import type { RegistrationOutsideSessionDetails } from '@hms/shared-types';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/**
 * Renders a refused check-in as one sentence in the reader's own locale
 * (P19-T16).
 *
 * Built from the error's structured `details` rather than its message, because
 * the message is English by contract — it is what an API client and the logs
 * see. Both locales say the same numbers, which is the part the desk acts on.
 */
export function useOutsideSessionStatement(): (
  details: RegistrationOutsideSessionDetails,
) => string {
  const t = useTranslations('operations.registrations.session');
  return useCallback(
    (details: RegistrationOutsideSessionDetails) => {
      if (details.reason === 'BEFORE_OPENING') {
        return t('beforeOpening', {
          doctor: details.doctorName,
          start: details.sessionStart ?? '',
          end: details.sessionEnd ?? '',
          opensAt: details.opensAt ?? '',
        });
      }
      if (details.reason === 'AFTER_END') {
        return t('afterEnd', {
          doctor: details.doctorName,
          start: details.sessionStart ?? '',
          end: details.sessionEnd ?? '',
        });
      }
      return t('noSession', { doctor: details.doctorName });
    },
    [t],
  );
}

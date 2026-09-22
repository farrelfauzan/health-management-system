import type { PatientVisitReminderConsentResponse } from '@hms/shared-types';

import {
  getPatientVisitReminderConsentControllerGetConsentV1QueryKey,
  patientVisitReminderConsentControllerGetConsentV1,
} from '#lib/api/generated/visit-reminder-consent/visit-reminder-consent';
import { useApiQuery } from '#lib/api/use-api-query';

/** The patient's visit-reminder consent (P25-T17, D-042). */
export function useVisitReminderConsent(patientId: string) {
  const query = useApiQuery<PatientVisitReminderConsentResponse>({
    queryKey: getPatientVisitReminderConsentControllerGetConsentV1QueryKey(patientId),
    queryFn: (signal) => patientVisitReminderConsentControllerGetConsentV1(patientId, signal),
    errorMessage: 'Failed to load visit reminder consent',
    enabled: patientId.length > 0,
  });

  return { ...query, consent: query.data?.consent ?? null };
}

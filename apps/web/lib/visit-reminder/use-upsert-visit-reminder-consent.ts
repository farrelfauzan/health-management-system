import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PatientVisitReminderConsentResponse,
  UpsertVisitReminderConsentInput,
} from '@hms/shared-types';

import { getMaternalVisitDueControllerListDueV1QueryKey } from '#lib/api/generated/maternal-care/maternal-care';
import { patientVisitReminderConsentControllerUpsertConsentV1 } from '#lib/api/generated/visit-reminder-consent/visit-reminder-consent';
import { parseApiSuccess } from '#lib/api/response';
import { invalidatePatientQueries } from '#lib/patients/invalidate-patient-queries';

/**
 * Capture or withdraw visit-reminder consent at the desk (P25-T17). The
 * server records the notice version and the actor; the client sends only
 * the answer.
 */
export function useUpsertVisitReminderConsent(patientId: string, errorMessage: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertVisitReminderConsentInput) => {
      const response = await patientVisitReminderConsentControllerUpsertConsentV1(patientId, input);
      return parseApiSuccess<PatientVisitReminderConsentResponse>(response, errorMessage);
    },
    onSuccess: async () => {
      await invalidatePatientQueries(queryClient);
      // The worklist shows who may be reminded.
      await queryClient.invalidateQueries({
        queryKey: getMaternalVisitDueControllerListDueV1QueryKey(),
      });
    },
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PatientDeliveryConsentsView,
  UpsertPatientDeliveryConsentInput,
} from '@hms/shared-types';

import { patientDeliveryConsentControllerUpsertConsentV1 } from '#lib/api/generated/patient-delivery-consent/patient-delivery-consent';
import { parseApiSuccess } from '#lib/api/response';
import { invalidatePatientQueries } from '#lib/patients/invalidate-patient-queries';

/**
 * Capture or withdraw one channel's consent at the counter (P16-T24). The
 * server decides the notice version and the actor; the client sends only
 * the channel and the answer.
 */
export function useUpsertPatientDeliveryConsent(patientId: string, errorMessage: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertPatientDeliveryConsentInput) => {
      const response = await patientDeliveryConsentControllerUpsertConsentV1(patientId, input);
      return parseApiSuccess<PatientDeliveryConsentsView>(response, errorMessage);
    },
    onSuccess: async () => {
      await invalidatePatientQueries(queryClient);
    },
  });
}

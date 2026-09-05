import type { PatientDeliveryConsentsView } from '@hms/shared-types';

import {
  getPatientDeliveryConsentControllerListConsentsV1QueryKey,
  patientDeliveryConsentControllerListConsentsV1,
} from '#lib/api/generated/patient-delivery-consent/patient-delivery-consent';
import { useApiQuery } from '#lib/api/use-api-query';

export function usePatientDeliveryConsents(patientId: string) {
  const query = useApiQuery<PatientDeliveryConsentsView>({
    queryKey: getPatientDeliveryConsentControllerListConsentsV1QueryKey(patientId),
    queryFn: (signal) => patientDeliveryConsentControllerListConsentsV1(patientId, signal),
    errorMessage: 'Failed to load delivery consent',
    enabled: patientId.length > 0,
  });

  return {
    ...query,
    consents: query.data,
  };
}

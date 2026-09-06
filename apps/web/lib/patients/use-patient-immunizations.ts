import type { ImmunizationResponse } from '@hms/shared-types';

import {
  getPatientImmunizationControllerListPatientImmunizationsV1QueryKey,
  patientImmunizationControllerListPatientImmunizationsV1,
} from '#lib/api/generated/encounters/encounters';
import { useApiQuery } from '#lib/api/use-api-query';

export function usePatientImmunizations(patientId: string) {
  const query = useApiQuery<ImmunizationResponse[]>({
    queryKey: getPatientImmunizationControllerListPatientImmunizationsV1QueryKey(patientId),
    queryFn: (signal) =>
      patientImmunizationControllerListPatientImmunizationsV1(patientId, signal),
    errorMessage: 'Failed to load the immunisation history',
    enabled: patientId.length > 0,
  });

  return { ...query, immunizations: query.data ?? [] };
}

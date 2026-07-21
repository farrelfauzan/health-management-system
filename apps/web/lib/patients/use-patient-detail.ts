import type { PatientDetail } from '@hms/shared-types';

import {
  getPatientManagementControllerGetPatientByIdV1QueryKey,
  patientManagementControllerGetPatientByIdV1,
} from '#lib/api/generated/patient-management/patient-management';
import { useApiQuery } from '#lib/api/use-api-query';

export function usePatientDetail(patientId: string) {
  const query = useApiQuery<PatientDetail>({
    queryKey: getPatientManagementControllerGetPatientByIdV1QueryKey(patientId),
    queryFn: (signal) => patientManagementControllerGetPatientByIdV1(patientId, signal),
    errorMessage: 'Failed to load patient',
    enabled: patientId.length > 0,
  });

  return {
    ...query,
    patient: query.data,
  };
}

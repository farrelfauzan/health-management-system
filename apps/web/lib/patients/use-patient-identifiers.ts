import type { PatientIdentifiers } from '@hms/shared-types';

import {
  getPatientManagementControllerGetPatientIdentifiersV1QueryKey,
  patientManagementControllerGetPatientIdentifiersV1,
} from '#lib/api/generated/patient-management/patient-management';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * Full, decrypted identifiers. Every response is audited server-side and the
 * route demands `patient.read-identifier`, so this is fetched only when a
 * user explicitly asks to reveal them — never eagerly with the profile.
 */
export function usePatientIdentifiers(patientId: string, isEnabled: boolean) {
  const query = useApiQuery<PatientIdentifiers>({
    queryKey: getPatientManagementControllerGetPatientIdentifiersV1QueryKey(patientId),
    queryFn: (signal) => patientManagementControllerGetPatientIdentifiersV1(patientId, signal),
    errorMessage: 'Failed to reveal the patient identifiers',
    enabled: isEnabled,
    options: {
      // Not cached: a reveal is an audited event, so a second look should be a
      // second, recorded request rather than a silent read from memory.
      gcTime: 0,
      staleTime: 0,
    },
  });

  return {
    ...query,
    identifiers: query.data,
  };
}

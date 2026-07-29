import type { DoctorIdentifiers } from '@hms/shared-types';

import {
  doctorManagementControllerGetDoctorIdentifiersV1,
  getDoctorManagementControllerGetDoctorIdentifiersV1QueryKey,
} from '#lib/api/generated/doctor-management/doctor-management';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The practitioner NIK, decrypted. Same rules as the patient equivalent: the
 * route demands `doctor.read-identifier` and audits every read, so it is
 * fetched only on explicit request and never cached.
 */
export function useDoctorIdentifiers(doctorId: string, isEnabled: boolean) {
  const query = useApiQuery<DoctorIdentifiers>({
    queryKey: getDoctorManagementControllerGetDoctorIdentifiersV1QueryKey(doctorId),
    queryFn: (signal) => doctorManagementControllerGetDoctorIdentifiersV1(doctorId, signal),
    errorMessage: 'Failed to reveal the practitioner identifiers',
    enabled: isEnabled,
    options: {
      gcTime: 0,
      staleTime: 0,
    },
  });

  return {
    ...query,
    identifiers: query.data,
  };
}

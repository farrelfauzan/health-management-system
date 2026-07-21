import type { DoctorPatientActivityEvent } from '@hms/shared-types';

import {
  doctorPatientControllerListActivityV1,
  getDoctorPatientControllerListActivityV1QueryKey,
} from '#lib/api/generated/doctor-patient/doctor-patient';
import { useApiQuery } from '#lib/api/use-api-query';

const ACTIVITY_PAGE_LIMIT = 20;

export function usePatientActivity(patientId: string, enabled: boolean) {
  const requestParams = {
    page: 1,
    limit: ACTIVITY_PAGE_LIMIT,
    patientId,
  };

  const query = useApiQuery<DoctorPatientActivityEvent[]>({
    queryKey: getDoctorPatientControllerListActivityV1QueryKey(requestParams),
    queryFn: (signal) => doctorPatientControllerListActivityV1(requestParams, signal),
    errorMessage: 'Failed to load patient activity',
    enabled: enabled && patientId.length > 0,
  });

  return {
    ...query,
    entries: query.data ?? [],
  };
}

import type { DoctorDetail } from '@hms/shared-types';

import {
  doctorManagementControllerGetDoctorByIdV1,
  getDoctorManagementControllerGetDoctorByIdV1QueryKey,
} from '#lib/api/generated/doctor-management/doctor-management';
import { useApiQuery } from '#lib/api/use-api-query';

export function useDoctorDetail(doctorId: string) {
  const query = useApiQuery<DoctorDetail>({
    queryKey: getDoctorManagementControllerGetDoctorByIdV1QueryKey(doctorId),
    queryFn: (signal) => doctorManagementControllerGetDoctorByIdV1(doctorId, signal),
    errorMessage: 'Failed to load doctor',
    enabled: doctorId.length > 0,
  });

  return {
    ...query,
    doctor: query.data,
  };
}

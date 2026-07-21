import type { DoctorListItem } from '@hms/shared-types';

import {
  doctorManagementControllerListDoctorsV1,
  getDoctorManagementControllerListDoctorsV1QueryKey,
} from '#lib/api/generated/doctor-management/doctor-management';
import { useApiQuery } from '#lib/api/use-api-query';

const ACTIVE_DOCTORS_LIMIT = 100;

export function useActiveDoctors(enabled: boolean) {
  const requestParams = {
    page: 1,
    limit: ACTIVE_DOCTORS_LIMIT,
    isActive: 'true' as const,
  };

  const query = useApiQuery<DoctorListItem[]>({
    queryKey: getDoctorManagementControllerListDoctorsV1QueryKey(requestParams),
    queryFn: (signal) => doctorManagementControllerListDoctorsV1(requestParams, signal),
    errorMessage: 'Failed to load doctors',
    enabled,
  });

  return {
    ...query,
    doctors: query.data ?? [],
  };
}

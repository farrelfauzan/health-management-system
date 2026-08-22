import type { DoctorListItem } from '@hms/shared-types';

import {
  doctorManagementControllerListDoctorsV1,
  getDoctorManagementControllerListDoctorsV1QueryKey,
} from '#lib/api/generated/doctor-management/doctor-management';
import type { DoctorManagementControllerListDoctorsV1Params } from '#lib/api/generated/model/doctorManagementControllerListDoctorsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

const DOCTOR_OPTIONS_LIMIT = 100;

/**
 * Active practitioners for the admit form's admitting-doctor field. A clinic
 * has tens of doctors, not thousands, so this one is a plain list rather than
 * a search — unlike {@link usePatientOptions}.
 */
export function useDoctorOptions() {
  const requestParams: DoctorManagementControllerListDoctorsV1Params = {
    page: 1,
    limit: DOCTOR_OPTIONS_LIMIT,
    isActive: 'true',
  };
  const query = useApiQuery<DoctorListItem[]>({
    queryKey: getDoctorManagementControllerListDoctorsV1QueryKey(requestParams),
    queryFn: (signal) => doctorManagementControllerListDoctorsV1(requestParams, signal),
    errorMessage: 'Failed to load doctors',
  });

  return {
    ...query,
    doctors: query.data ?? [],
  };
}

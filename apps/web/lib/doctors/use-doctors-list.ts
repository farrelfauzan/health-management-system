import type { DoctorListItem, DoctorsListMeta } from '@hms/shared-types';

import {
  doctorManagementControllerListDoctorsV1,
  getDoctorManagementControllerListDoctorsV1QueryKey,
} from '#lib/api/generated/doctor-management/doctor-management';
import type { DoctorManagementControllerListDoctorsV1Params } from '#lib/api/generated/model/doctorManagementControllerListDoctorsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';
import type { DoctorsSearchParams } from '#lib/doctors/search-params';

export function useDoctorsList(params: DoctorsSearchParams) {
  const requestParams: DoctorManagementControllerListDoctorsV1Params = {
    page: params.page,
    limit: params.limit,
    search: params.search,
    specialtyId: params.specialtyId,
    isActive: params.isActive,
  };

  const query = useApiQuery<DoctorListItem[]>({
    queryKey: getDoctorManagementControllerListDoctorsV1QueryKey(requestParams),
    queryFn: (signal) => doctorManagementControllerListDoctorsV1(requestParams, signal),
    errorMessage: 'Failed to load doctors',
  });

  return {
    ...query,
    doctors: query.data ?? [],
    meta: query.meta as DoctorsListMeta | undefined,
  };
}

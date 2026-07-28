import type { PatientListItem, PatientsListMeta } from '@hms/shared-types';

import {
  getPatientManagementControllerListPatientsV1QueryKey,
  patientManagementControllerListPatientsV1,
} from '#lib/api/generated/patient-management/patient-management';
import type { PatientManagementControllerListPatientsV1Params } from '#lib/api/generated/model/patientManagementControllerListPatientsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';
import type { PatientsSearchParams } from '#lib/patients/search-params';

export function usePatientsList(params: PatientsSearchParams) {
  const requestParams: PatientManagementControllerListPatientsV1Params = {
    page: params.page,
    limit: params.limit,
    search: params.search,
    status: params.status,
    hasAppointment:
      params.hasAppointment === undefined
        ? undefined
        : params.hasAppointment
          ? 'true'
          : 'false',
    createdFrom: params.createdFrom,
    createdTo: params.createdTo,
  };

  const query = useApiQuery<PatientListItem[]>({
    queryKey: getPatientManagementControllerListPatientsV1QueryKey(requestParams),
    queryFn: (signal) => patientManagementControllerListPatientsV1(requestParams, signal),
    errorMessage: 'Failed to load patients',
  });

  return {
    ...query,
    patients: query.data ?? [],
    meta: query.meta as PatientsListMeta | undefined,
  };
}

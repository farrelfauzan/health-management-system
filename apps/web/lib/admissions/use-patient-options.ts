import type { PatientListItem } from '@hms/shared-types';

import {
  getPatientManagementControllerListPatientsV1QueryKey,
  patientManagementControllerListPatientsV1,
} from '#lib/api/generated/patient-management/patient-management';
import type { PatientManagementControllerListPatientsV1Params } from '#lib/api/generated/model/patientManagementControllerListPatientsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

const PATIENT_OPTIONS_LIMIT = 20;

const MIN_SEARCH_LENGTH = 2;

/**
 * Candidates for the admit form's patient field.
 *
 * Search-driven rather than a full list: a clinic's patient table is the
 * largest one in the database, and a select box that loads all of it is a
 * select box nobody can scroll. Below two characters it stays quiet rather
 * than fetching the first page of everyone.
 */
export function usePatientOptions(search: string) {
  const trimmedSearch = search.trim();
  const isEnabled = trimmedSearch.length >= MIN_SEARCH_LENGTH;
  const requestParams: PatientManagementControllerListPatientsV1Params = {
    page: 1,
    limit: PATIENT_OPTIONS_LIMIT,
    search: trimmedSearch,
  };
  const query = useApiQuery<PatientListItem[]>({
    queryKey: getPatientManagementControllerListPatientsV1QueryKey(requestParams),
    queryFn: (signal) => patientManagementControllerListPatientsV1(requestParams, signal),
    errorMessage: 'Failed to load patients',
    enabled: isEnabled,
  });

  return {
    ...query,
    patients: query.data ?? [],
  };
}

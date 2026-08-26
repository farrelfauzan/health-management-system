import { useAbility } from '@hms/ui';

import {
  adminManagementControllerListUsersV1,
  getAdminManagementControllerListUsersV1QueryKey,
} from '#lib/api/generated/admin-management/admin-management';
import {
  doctorManagementControllerListDoctorsV1,
  getDoctorManagementControllerListDoctorsV1QueryKey,
} from '#lib/api/generated/doctor-management/doctor-management';
import type { AdminManagementControllerListUsersV1200DataItem } from '#lib/api/generated/model/adminManagementControllerListUsersV1200DataItem';
import type { DoctorManagementControllerListDoctorsV1200DataItem } from '#lib/api/generated/model/doctorManagementControllerListDoctorsV1200DataItem';
import type { PatientManagementControllerListPatientsV1200DataItem } from '#lib/api/generated/model/patientManagementControllerListPatientsV1200DataItem';
import {
  getPatientManagementControllerListPatientsV1QueryKey,
  patientManagementControllerListPatientsV1,
} from '#lib/api/generated/patient-management/patient-management';
import { useApiQuery } from '#lib/api/use-api-query';

/** Below this the search matches too much to be a search, and the API refuses it. */
const MIN_SEARCH_LENGTH = 2;
/** The palette shows a preview per entity, not a directory page. */
const GROUP_LIMIT = 5;

export type GlobalSearchResults = {
  patients: PatientManagementControllerListPatientsV1200DataItem[];
  doctors: DoctorManagementControllerListDoctorsV1200DataItem[];
  users: AdminManagementControllerListUsersV1200DataItem[];
  isSearchable: boolean;
  isSearching: boolean;
};

/**
 * Frontend fan-out for the global search palette: one request per entity the
 * ability can read, against the list endpoints that already accept `search`.
 * Disabled below the minimum length and while the palette is closed, so a
 * closed shell never polls. A cross-entity aggregate endpoint is a deliberate
 * non-goal (IMP-22); revisit only if fan-out latency or ranking hurts.
 */
export function useGlobalSearchResults({
  search,
  isEnabled,
}: {
  search: string;
  isEnabled: boolean;
}): GlobalSearchResults {
  const ability = useAbility();
  const trimmed = search.trim();
  const isSearchable = isEnabled && trimmed.length >= MIN_SEARCH_LENGTH;
  const requestParams = { page: 1, limit: GROUP_LIMIT, search: trimmed };
  const canReadPatients = ability.can('read', 'Patient');
  const canReadDoctors = ability.can('read', 'Doctor');
  const canReadUsers = ability.can('read', 'User');
  const patientsQuery = useApiQuery<PatientManagementControllerListPatientsV1200DataItem[]>({
    queryKey: getPatientManagementControllerListPatientsV1QueryKey(requestParams),
    queryFn: (signal) => patientManagementControllerListPatientsV1(requestParams, signal),
    errorMessage: 'Failed to search patients',
    enabled: isSearchable && canReadPatients,
    options: { retry: false },
  });
  const doctorsQuery = useApiQuery<DoctorManagementControllerListDoctorsV1200DataItem[]>({
    queryKey: getDoctorManagementControllerListDoctorsV1QueryKey(requestParams),
    queryFn: (signal) => doctorManagementControllerListDoctorsV1(requestParams, signal),
    errorMessage: 'Failed to search doctors',
    enabled: isSearchable && canReadDoctors,
    options: { retry: false },
  });
  const usersQuery = useApiQuery<AdminManagementControllerListUsersV1200DataItem[]>({
    queryKey: getAdminManagementControllerListUsersV1QueryKey(requestParams),
    queryFn: (signal) => adminManagementControllerListUsersV1(requestParams, signal),
    errorMessage: 'Failed to search users',
    enabled: isSearchable && canReadUsers,
    options: { retry: false },
  });
  return {
    patients: isSearchable && canReadPatients ? (patientsQuery.data ?? []) : [],
    doctors: isSearchable && canReadDoctors ? (doctorsQuery.data ?? []) : [],
    users: isSearchable && canReadUsers ? (usersQuery.data ?? []) : [],
    isSearchable,
    isSearching:
      isSearchable &&
      (patientsQuery.isFetching || doctorsQuery.isFetching || usersQuery.isFetching),
  };
}

import type { PatientManagementControllerGetCurrentPrivacyNoticeV1200Data } from '#lib/api/generated/model/patientManagementControllerGetCurrentPrivacyNoticeV1200Data';
import {
  getPatientManagementControllerGetCurrentPrivacyNoticeV1QueryKey,
  patientManagementControllerGetCurrentPrivacyNoticeV1,
} from '#lib/api/generated/patient-management/patient-management';
import { useApiQuery } from '#lib/api/use-api-query';

export function useCurrentPrivacyNotice(isEnabled: boolean) {
  const query = useApiQuery<PatientManagementControllerGetCurrentPrivacyNoticeV1200Data>({
    queryKey: getPatientManagementControllerGetCurrentPrivacyNoticeV1QueryKey(),
    queryFn: patientManagementControllerGetCurrentPrivacyNoticeV1,
    errorMessage: 'Failed to load the current privacy notice',
    enabled: isEnabled,
  });

  return { ...query, notice: query.data };
}

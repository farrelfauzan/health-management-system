import type { PatientFamilyPlanningResponse } from '@hms/shared-types';

import {
  familyPlanningControllerGetPatientFamilyPlanningV1,
  getFamilyPlanningControllerGetPatientFamilyPlanningV1QueryKey,
} from '#lib/api/generated/maternal-care/maternal-care';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The patient's family planning record (P25-T14): the live course, every
 * course, and a recent birth to offer as KB pasca salin.
 */
export function usePatientFamilyPlanning(patientId: string, isEnabled: boolean) {
  const query = useApiQuery<PatientFamilyPlanningResponse>({
    queryKey: getFamilyPlanningControllerGetPatientFamilyPlanningV1QueryKey(patientId),
    queryFn: (signal) => familyPlanningControllerGetPatientFamilyPlanningV1(patientId, signal),
    errorMessage: 'Failed to load the family planning record',
    enabled: isEnabled && patientId.length > 0,
  });

  return { ...query, record: query.data ?? null };
}

import type { ClinicianFeeStatementView } from '@hms/shared-types';

import {
  clinicianFeeStatementControllerGetStatementV1,
  getClinicianFeeStatementControllerGetStatementV1QueryKey,
} from '#lib/api/generated/clinician-fees/clinician-fees';
import { useApiQuery } from '#lib/api/use-api-query';

type UseClinicianFeeStatementParams = {
  doctorId: string | null;
  period: string;
};

/** One clinician's monthly jasa medis statement (P27-T06); idle until one is picked. */
export function useClinicianFeeStatement({ doctorId, period }: UseClinicianFeeStatementParams) {
  const params = { period };
  const selectedDoctorId = doctorId ?? '';
  const result = useApiQuery<ClinicianFeeStatementView>({
    queryKey: getClinicianFeeStatementControllerGetStatementV1QueryKey(selectedDoctorId, params),
    queryFn: (signal) =>
      clinicianFeeStatementControllerGetStatementV1(selectedDoctorId, params, signal),
    errorMessage: 'Unable to load the jasa medis statement.',
    enabled: doctorId !== null && period.length > 0,
  });

  return { ...result, statement: result.data };
}

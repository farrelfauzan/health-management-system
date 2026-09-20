import type { DoctorMandate } from '@hms/shared-types';

import {
  doctorMandateControllerListMandatesV1,
  getDoctorMandateControllerListMandatesV1QueryKey,
} from '#lib/api/generated/doctor-mandates/doctor-mandates';
import { useApiQuery } from '#lib/api/use-api-query';

/** A midwife's written pelimpahan (P25-T05). Disabled until the card may render. */
export function useDoctorMandates(doctorId: string, isEnabled: boolean) {
  const query = useApiQuery<DoctorMandate[]>({
    queryKey: getDoctorMandateControllerListMandatesV1QueryKey(doctorId),
    queryFn: (signal) => doctorMandateControllerListMandatesV1(doctorId, signal),
    errorMessage: 'Failed to load mandates',
    enabled: isEnabled && doctorId.length > 0,
  });
  return {
    ...query,
    mandates: query.data ?? [],
  };
}

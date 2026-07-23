import type { DoctorSessionListItem } from '@hms/shared-types';

import {
  appointmentSessionControllerListDoctorSessionsV1,
  getAppointmentSessionControllerListDoctorSessionsV1QueryKey,
} from '#lib/api/generated/appointment-management/appointment-management';
import { useApiQuery } from '#lib/api/use-api-query';

export type DoctorSessionsParams = {
  doctorId: string;
  from: string;
  to: string;
};

export function useDoctorSessions(params: DoctorSessionsParams) {
  const requestParams = { from: params.from, to: params.to };

  const query = useApiQuery<DoctorSessionListItem[]>({
    queryKey: getAppointmentSessionControllerListDoctorSessionsV1QueryKey(
      params.doctorId,
      requestParams,
    ),
    queryFn: (signal) =>
      appointmentSessionControllerListDoctorSessionsV1(params.doctorId, requestParams, signal),
    errorMessage: 'Failed to load sessions',
    enabled: Boolean(params.doctorId && params.from && params.to),
  });

  return {
    ...query,
    sessions: query.data ?? [],
  };
}

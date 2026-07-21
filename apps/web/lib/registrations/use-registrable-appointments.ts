import type { AppointmentListItem } from '@hms/shared-types';

import {
  appointmentManagementControllerListAppointmentsV1,
  getAppointmentManagementControllerListAppointmentsV1QueryKey,
} from '#lib/api/generated/appointment-management/appointment-management';
import type { AppointmentManagementControllerListAppointmentsV1Params } from '#lib/api/generated/model/appointmentManagementControllerListAppointmentsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

const REGISTRABLE_APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED'] as const;
const PICKER_PAGE = { page: 1, limit: 100 };

export function useRegistrableAppointments(patientId: string) {
  const requestParams: AppointmentManagementControllerListAppointmentsV1Params = {
    ...PICKER_PAGE,
    patientId: patientId || undefined,
  };

  const query = useApiQuery<AppointmentListItem[]>({
    queryKey: getAppointmentManagementControllerListAppointmentsV1QueryKey(requestParams),
    queryFn: (signal) => appointmentManagementControllerListAppointmentsV1(requestParams, signal),
    errorMessage: 'Failed to load appointments',
    enabled: patientId.length > 0,
  });

  return {
    ...query,
    appointments: (query.data ?? []).filter((appointment) =>
      REGISTRABLE_APPOINTMENT_STATUSES.some((status) => status === appointment.status),
    ),
  };
}

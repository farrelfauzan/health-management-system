import type { AppointmentListItem, AppointmentsListMeta } from '@hms/shared-types';

import {
  appointmentManagementControllerListAppointmentsV1,
  getAppointmentManagementControllerListAppointmentsV1QueryKey,
} from '#lib/api/generated/appointment-management/appointment-management';
import type { AppointmentManagementControllerListAppointmentsV1Params } from '#lib/api/generated/model/appointmentManagementControllerListAppointmentsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

export type AppointmentsListParams = {
  page: number;
  limit: number;
  scheduledFrom?: string;
  scheduledTo?: string;
};

export function useAppointmentsList(params: AppointmentsListParams) {
  const requestParams: AppointmentManagementControllerListAppointmentsV1Params = {
    page: params.page,
    limit: params.limit,
    scheduledFrom: params.scheduledFrom,
    scheduledTo: params.scheduledTo,
  };

  const query = useApiQuery<AppointmentListItem[]>({
    queryKey: getAppointmentManagementControllerListAppointmentsV1QueryKey(requestParams),
    queryFn: (signal) => appointmentManagementControllerListAppointmentsV1(requestParams, signal),
    errorMessage: 'Failed to load appointments',
  });

  return {
    ...query,
    appointments: query.data ?? [],
    meta: query.meta as AppointmentsListMeta | undefined,
  };
}

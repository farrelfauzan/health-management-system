import type { AppointmentListItem, AppointmentsListMeta } from '@hms/shared-types';

import {
  appointmentManagementControllerListAppointmentsV1,
  getAppointmentManagementControllerListAppointmentsV1QueryKey,
} from '#lib/api/generated/appointment-management/appointment-management';
import type { AppointmentManagementControllerListAppointmentsV1Params } from '#lib/api/generated/model/appointmentManagementControllerListAppointmentsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

const REQUESTS_PAGE_LIMIT = 50;

export function useAppointmentRequests() {
  const requestParams: AppointmentManagementControllerListAppointmentsV1Params = {
    page: 1,
    limit: REQUESTS_PAGE_LIMIT,
    status: 'REQUESTED',
  };

  const query = useApiQuery<AppointmentListItem[]>({
    queryKey: getAppointmentManagementControllerListAppointmentsV1QueryKey(requestParams),
    queryFn: (signal) => appointmentManagementControllerListAppointmentsV1(requestParams, signal),
    errorMessage: 'Failed to load appointment requests',
  });

  return {
    ...query,
    requests: query.data ?? [],
    meta: query.meta as AppointmentsListMeta | undefined,
  };
}

import { useMemo } from 'react';
import type { AppointmentListItem, AppointmentsListMeta } from '@hms/shared-types';

import {
  appointmentManagementControllerListAppointmentsV1,
  getAppointmentManagementControllerListAppointmentsV1QueryKey,
} from '#lib/api/generated/appointment-management/appointment-management';
import { useApiQuery } from '#lib/api/use-api-query';
import { DASHBOARD_REFRESH_INTERVAL_MS } from '#lib/dashboard/dashboard-refresh';
import { getTodayRange } from '#lib/dashboard/today-range';

const TODAY_APPOINTMENTS_PAGE_LIMIT = 100;

export function useTodayAppointments() {
  const todayRange = useMemo(() => getTodayRange(new Date()), []);
  const params = {
    page: 1,
    limit: TODAY_APPOINTMENTS_PAGE_LIMIT,
    scheduledFrom: todayRange.from,
    scheduledTo: todayRange.to,
  };
  const query = useApiQuery<AppointmentListItem[]>({
    queryKey: getAppointmentManagementControllerListAppointmentsV1QueryKey(params),
    queryFn: (signal) => appointmentManagementControllerListAppointmentsV1(params, signal),
    errorMessage: "Failed to load today's appointments",
    options: {
      refetchInterval: DASHBOARD_REFRESH_INTERVAL_MS,
    },
  });
  const appointments = useMemo(
    () =>
      [...(query.data ?? [])].sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      ),
    [query.data],
  );
  return {
    ...query,
    appointments,
    meta: query.meta as AppointmentsListMeta | undefined,
  };
}

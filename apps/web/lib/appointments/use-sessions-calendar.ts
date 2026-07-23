import type { DoctorSessionCalendarItem } from '@hms/shared-types';

import {
  appointmentSessionControllerListSessionsCalendarV1,
  getAppointmentSessionControllerListSessionsCalendarV1QueryKey,
} from '#lib/api/generated/appointment-management/appointment-management';
import { useApiQuery } from '#lib/api/use-api-query';

export type SessionsCalendarParams = {
  from: string;
  to: string;
};

export function useSessionsCalendar(params: SessionsCalendarParams) {
  const query = useApiQuery<DoctorSessionCalendarItem[]>({
    queryKey: getAppointmentSessionControllerListSessionsCalendarV1QueryKey(params),
    queryFn: (signal) => appointmentSessionControllerListSessionsCalendarV1(params, signal),
    errorMessage: 'Failed to load sessions',
    enabled: Boolean(params.from && params.to),
  });

  return {
    ...query,
    sessions: query.data ?? [],
  };
}

import type { AppointmentSessionResponse, SessionQueueEntry } from '@hms/shared-types';

import {
  appointmentSessionControllerGetSessionQueueV1,
  getAppointmentSessionControllerGetSessionQueueV1QueryKey,
} from '#lib/api/generated/appointment-management/appointment-management';
import { useApiQuery } from '#lib/api/use-api-query';

export type SessionQueueData = {
  session: AppointmentSessionResponse;
  queue: SessionQueueEntry[];
};

export function useSessionQueue(sessionId: string) {
  const query = useApiQuery<SessionQueueData>({
    queryKey: getAppointmentSessionControllerGetSessionQueueV1QueryKey(sessionId),
    queryFn: (signal) => appointmentSessionControllerGetSessionQueueV1(sessionId, signal),
    errorMessage: 'Failed to load session queue',
    enabled: Boolean(sessionId),
  });

  return {
    ...query,
    session: query.data?.session,
    queue: query.data?.queue ?? [],
  };
}

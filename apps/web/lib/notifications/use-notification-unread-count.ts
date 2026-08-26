import type { NotificationUnreadCountView } from '@hms/shared-types';

import {
  getNotificationControllerGetUnreadCountV1QueryKey,
  notificationControllerGetUnreadCountV1,
} from '#lib/api/generated/notifications/notifications';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * Matches the handoff-summary poll: this badge sits in the shell of every
 * signed-in session, so the interval is deliberately slow — a notification
 * arriving thirty seconds late costs nothing, a fleet of fast pollers does.
 */
const UNREAD_COUNT_POLL_INTERVAL_MS = 30_000;

export function useNotificationUnreadCount(enabled: boolean) {
  const query = useApiQuery<NotificationUnreadCountView>({
    queryKey: getNotificationControllerGetUnreadCountV1QueryKey(),
    queryFn: (signal) => notificationControllerGetUnreadCountV1(signal),
    errorMessage: 'Unable to load the notification count.',
    enabled,
    options: { retry: false, refetchInterval: UNREAD_COUNT_POLL_INTERVAL_MS },
  });
  return { ...query, unreadCount: query.data?.unreadCount ?? 0 };
}

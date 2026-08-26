import type { NotificationView, NotificationsListMeta } from '@hms/shared-types';

import {
  getNotificationControllerListNotificationsV1QueryKey,
  notificationControllerListNotificationsV1,
} from '#lib/api/generated/notifications/notifications';
import { useApiQuery } from '#lib/api/use-api-query';

/** The bell shows a preview, not an archive; older rows stay on the server. */
const NOTIFICATIONS_PREVIEW_LIMIT = 10;

/**
 * The first page of the caller's feed. Enabled only while the menu is open —
 * the closed shell polls the unread count, never the list.
 */
export function useNotificationsList(enabled: boolean) {
  const params = { page: 1, limit: NOTIFICATIONS_PREVIEW_LIMIT };
  const query = useApiQuery<NotificationView[]>({
    queryKey: getNotificationControllerListNotificationsV1QueryKey(params),
    queryFn: (signal) => notificationControllerListNotificationsV1(params, signal),
    errorMessage: 'Unable to load notifications.',
    enabled,
    options: { retry: false },
  });
  return {
    ...query,
    notifications: query.data ?? [],
    meta: query.meta as NotificationsListMeta | undefined,
  };
}

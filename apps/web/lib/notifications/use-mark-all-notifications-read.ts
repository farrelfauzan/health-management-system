'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  getNotificationControllerGetUnreadCountV1QueryKey,
  notificationControllerMarkAllAsReadV1,
} from '#lib/api/generated/notifications/notifications';

/**
 * Opening the bell is the read receipt, so this fires on open rather than on
 * a button. Only the count is invalidated: the open menu keeps showing which
 * rows *were* unread until it is next opened, which is the useful rendering.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationControllerMarkAllAsReadV1(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: getNotificationControllerGetUnreadCountV1QueryKey(),
      });
    },
  });
}

import type { NotificationTypeValue } from '#notification/schemas';

/** Repository projection of one notification row; dates stay `Date` here. */
export type NotificationRecord = {
  id: string;
  userId: string;
  type: NotificationTypeValue;
  titleKey: string;
  bodyKey: string;
  params: Record<string, string>;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export type CreateNotificationPayload = {
  userId: string;
  type: NotificationTypeValue;
  titleKey: string;
  bodyKey: string;
  params: Record<string, string>;
  href?: string | null;
};

export type ListNotificationsParams = {
  userId: string;
  page: number;
  limit: number;
};

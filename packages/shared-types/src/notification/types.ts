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

/**
 * Which web shell a notification recipient lands in. The `href` stored on a
 * notification row is shell-relative (`/admin/...` vs `/doctor/...`), and
 * `apps/web/proxy.ts` bounces any path whose shell the recipient does not
 * hold — silently, to their own home — so a producer must resolve this from
 * the *recipient* rather than from the record being announced.
 */
export type NotificationShell = 'admin' | 'doctor';

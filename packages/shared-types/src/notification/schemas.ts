import { z } from 'zod';

/**
 * The domain events that currently produce a notification. Mirrors the Prisma
 * `NotificationType` enum. Kinds are distinct because each carries its own
 * i18n copy and deep link, not because they behave differently in the feed.
 */
export const NOTIFICATION_TYPES = [
  'APPOINTMENT_APPROVED',
  'APPOINTMENT_REJECTED',
  'CONVERSATION_HANDOFF',
] as const;
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationTypeValue = z.infer<typeof notificationTypeSchema>;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type ListNotificationsQueryInput = z.infer<typeof listNotificationsQuerySchema>;

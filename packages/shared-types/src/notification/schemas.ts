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
  /**
   * A document in the actor's own vault is approaching, or past, its expiry
   * date (P16-T16; fired by P16-T18). Both are owner-only: the feed row goes
   * to the person whose document it is and to nobody else, no administrator
   * is copied, and nothing aggregates them into a clinic-wide view. The
   * clinic-visible equivalent is `DoctorLicense` (P16-T19), which touches no
   * document at all.
   */
  'VAULT_DOCUMENT_EXPIRING',
  'VAULT_DOCUMENT_EXPIRED',
  /**
   * Sharing (P16-T34, FR-E3-16/19). `SHARED` tells the recipient a document
   * was handed to them. `OPENED` tells the **owner** that a recipient opened
   * it for the first time, and is the unusual one of the pair: a share is
   * only safe to give if the giver can see it being used, so the product
   * tells them rather than making them ask. Both are addressed to one person
   * — neither is broadcast, and no administrator is copied on either.
   */
  'VAULT_DOCUMENT_SHARED',
  'VAULT_DOCUMENT_OPENED',
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

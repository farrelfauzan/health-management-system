import {
  CreateNotificationPayload,
  ListNotificationsQueryInput,
  NotificationRecord,
  NotificationView,
  NotificationsListMeta,
  NotificationUnreadCountView,
  NotificationsReadAllView,
} from '@hms/shared-types';
import { Injectable, NotFoundException } from '@nestjs/common';

import { NotificationRepository } from '../repository/notification.repository';

/**
 * A user's in-app bell feed (IMP-21). Every read is scoped to the caller by
 * construction — the catalog defines `notification.*` in OWN scope only, so
 * there is no ANY branch to resolve: the repository filters on the recipient
 * unconditionally and a wrong-owner id is indistinguishable from a missing
 * one (404, never 403, so ids cannot be probed).
 *
 * `createForUser`/`createForUsers` are the producer API. Producers call them
 * best-effort inside their own try/catch — a failed notification must never
 * fail the domain act it announces.
 */
@Injectable()
export class NotificationService {
  constructor(private readonly notificationRepository: NotificationRepository) {}

  async listForUser(
    userId: string,
    query: ListNotificationsQueryInput,
  ): Promise<{ items: NotificationView[]; meta: NotificationsListMeta }> {
    const result = await this.notificationRepository.listByUser({
      userId,
      page: query.page,
      limit: query.limit,
    });
    return {
      items: result.items.map((record) => this.toNotificationView(record)),
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  async getUnreadCount(userId: string): Promise<NotificationUnreadCountView> {
    const unreadCount = await this.notificationRepository.countUnread(userId);
    return { unreadCount };
  }

  async markAsRead(id: string, userId: string): Promise<NotificationView> {
    const record = await this.notificationRepository.markRead(id, userId);
    if (!record) {
      throw new NotFoundException('Notification not found');
    }
    return this.toNotificationView(record);
  }

  async markAllAsRead(userId: string): Promise<NotificationsReadAllView> {
    const updatedCount = await this.notificationRepository.markAllRead(userId);
    return { updatedCount };
  }

  async createForUser(payload: CreateNotificationPayload): Promise<NotificationView> {
    const record = await this.notificationRepository.createForUser(payload);
    return this.toNotificationView(record);
  }

  async createForUsers(
    userIds: string[],
    payload: Omit<CreateNotificationPayload, 'userId'>,
  ): Promise<number> {
    return this.notificationRepository.createForUsers(userIds, payload);
  }

  /**
   * Broadcasts to every live human account whose roles carry the permission —
   * how producers reach "staff" when the triggering record names no HMS user,
   * as a customer-service conversation never does.
   */
  async createForUsersWithPermission(
    permissionKey: string,
    payload: Omit<CreateNotificationPayload, 'userId'>,
  ): Promise<number> {
    const userIds = await this.notificationRepository.findUserIdsWithPermissionKey(permissionKey);
    return this.notificationRepository.createForUsers(userIds, payload);
  }

  private toNotificationView(record: NotificationRecord): NotificationView {
    return {
      id: record.id,
      type: record.type,
      titleKey: record.titleKey,
      bodyKey: record.bodyKey,
      params: record.params,
      href: record.href,
      readAt: record.readAt ? record.readAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
    };
  }
}

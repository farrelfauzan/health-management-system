import {
  CreateNotificationPayload,
  ListNotificationsParams,
  NotificationRecord,
  NotificationTypeValue,
  PagedRecords,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

type NotificationRow = {
  id: string;
  userId: string;
  type: NotificationTypeValue;
  titleKey: string;
  bodyKey: string;
  params: Prisma.JsonValue;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createForUser(payload: CreateNotificationPayload): Promise<NotificationRecord> {
    const row = await this.prisma.notification.create({
      data: {
        userId: payload.userId,
        type: payload.type,
        titleKey: payload.titleKey,
        bodyKey: payload.bodyKey,
        params: payload.params,
        href: payload.href ?? null,
      },
    });
    return this.toNotificationRecord(row);
  }

  async createForUsers(
    userIds: string[],
    payload: Omit<CreateNotificationPayload, 'userId'>,
  ): Promise<number> {
    if (userIds.length === 0) {
      return 0;
    }
    const result = await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: payload.type,
        titleKey: payload.titleKey,
        bodyKey: payload.bodyKey,
        params: payload.params,
        href: payload.href ?? null,
      })),
    });
    return result.count;
  }

  /**
   * The recipients for a broadcast: every live human account whose current
   * roles carry the permission. Service accounts are excluded — nothing reads
   * a feed on their behalf.
   */
  async findUserIdsWithPermissionKey(permissionKey: string): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        isActive: true,
        isSystem: false,
        deletedAt: null,
        roles: {
          some: {
            deletedAt: null,
            unassignedAt: null,
            role: {
              permissions: { some: { permission: { permissionKey } } },
            },
          },
        },
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async listByUser(params: ListNotificationsParams): Promise<PagedRecords<NotificationRecord>> {
    const { userId, page, limit } = params;
    const skip = (page - 1) * limit;
    const where = { userId };
    const [rows, total] = await this.prisma.executeTransaction(async (tx) => {
      const notifications = await this.prisma.findManyActive(tx.notification, {
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' as const },
      });
      const count = await this.prisma.countActive(tx.notification, { where });
      return [notifications, count] as const;
    });
    return { items: rows.map((row) => this.toNotificationRecord(row)), page, limit, total };
  }

  async countUnread(userId: string): Promise<number> {
    return this.prisma.countActive(this.prisma.notification, {
      where: { userId, readAt: null },
    });
  }

  async findByIdForUser(id: string, userId: string): Promise<NotificationRecord | null> {
    const row = await this.prisma.findFirstActive(this.prisma.notification, {
      where: { id, userId },
    });
    return row ? this.toNotificationRecord(row) : null;
  }

  async markRead(id: string, userId: string): Promise<NotificationRecord | null> {
    await this.prisma.notification.updateMany({
      where: { id, userId, deletedAt: null, readAt: null },
      data: { readAt: new Date() },
    });
    return this.findByIdForUser(id, userId);
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, deletedAt: null, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  private toNotificationRecord(row: NotificationRow): NotificationRecord {
    return {
      id: row.id,
      userId: row.userId,
      type: row.type,
      titleKey: row.titleKey,
      bodyKey: row.bodyKey,
      params: this.toParams(row.params),
      href: row.href,
      readAt: row.readAt,
      createdAt: row.createdAt,
    };
  }

  private toParams(value: Prisma.JsonValue): Record<string, string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, String(entry ?? '')]),
    );
  }
}

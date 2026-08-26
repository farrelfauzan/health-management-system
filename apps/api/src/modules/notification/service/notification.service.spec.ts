import { NotFoundException } from '@nestjs/common';

import { NotificationRecord } from '@hms/shared-types';

import { NotificationRepository } from '../repository/notification.repository';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  const mockRepository = {
    createForUser: jest.fn(),
    createForUsers: jest.fn(),
    findUserIdsWithPermissionKey: jest.fn(),
    listByUser: jest.fn(),
    countUnread: jest.fn(),
    findByIdForUser: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  };
  const service = new NotificationService(
    mockRepository as unknown as NotificationRepository,
  );
  const inputUserId = '4f1d2c3b-5a69-4e78-8b90-1c2d3e4f5a6b';
  const mockRecord: NotificationRecord = {
    id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    userId: inputUserId,
    type: 'APPOINTMENT_APPROVED',
    titleKey: 'appointmentApproved.title',
    bodyKey: 'appointmentApproved.body',
    params: { doctorName: 'dr. Ratna Dewi, Sp.PD' },
    href: null,
    readAt: null,
    createdAt: new Date('2026-08-26T03:12:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps records to views with ISO dates when listing', async () => {
    mockRepository.listByUser.mockResolvedValue({
      items: [mockRecord],
      page: 1,
      limit: 10,
      total: 1,
    });
    const actual = await service.listForUser(inputUserId, { page: 1, limit: 10 });
    expect(mockRepository.listByUser).toHaveBeenCalledWith({
      userId: inputUserId,
      page: 1,
      limit: 10,
    });
    expect(actual.items[0]).toEqual({
      id: mockRecord.id,
      type: 'APPOINTMENT_APPROVED',
      titleKey: 'appointmentApproved.title',
      bodyKey: 'appointmentApproved.body',
      params: { doctorName: 'dr. Ratna Dewi, Sp.PD' },
      href: null,
      readAt: null,
      createdAt: '2026-08-26T03:12:00.000Z',
    });
    expect(actual.meta).toEqual({ page: 1, limit: 10, total: 1 });
  });

  it('returns the unread count as a view', async () => {
    mockRepository.countUnread.mockResolvedValue(3);
    const actual = await service.getUnreadCount(inputUserId);
    expect(actual).toEqual({ unreadCount: 3 });
  });

  it('throws NotFound when marking a row the caller does not own', async () => {
    mockRepository.markRead.mockResolvedValue(null);
    await expect(service.markAsRead(mockRecord.id, inputUserId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reports how many rows read-all flipped', async () => {
    mockRepository.markAllRead.mockResolvedValue(2);
    const actual = await service.markAllAsRead(inputUserId);
    expect(actual).toEqual({ updatedCount: 2 });
  });

  it('broadcasts by permission through the resolved user ids', async () => {
    mockRepository.findUserIdsWithPermissionKey.mockResolvedValue(['user-a', 'user-b']);
    mockRepository.createForUsers.mockResolvedValue(2);
    const inputPayload = {
      type: 'CONVERSATION_HANDOFF' as const,
      titleKey: 'conversationHandoff.title',
      bodyKey: 'conversationHandoff.body',
      params: { channel: 'TELEGRAM' },
      href: '/admin/conversations',
    };
    const actual = await service.createForUsersWithPermission(
      'conversation.read:any',
      inputPayload,
    );
    expect(mockRepository.findUserIdsWithPermissionKey).toHaveBeenCalledWith(
      'conversation.read:any',
    );
    expect(mockRepository.createForUsers).toHaveBeenCalledWith(['user-a', 'user-b'], inputPayload);
    expect(actual).toBe(2);
  });
});

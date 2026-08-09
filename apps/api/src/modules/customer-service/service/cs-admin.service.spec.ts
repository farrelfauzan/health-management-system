import { ConflictException, Logger, NotFoundException } from '@nestjs/common';

import { AdminConversationRecord } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { OutboundMessageDispatcherService } from '../../channel-gateway/service/outbound-message-dispatcher.service';
import { AdminConversationRepository } from '../repository/admin-conversation.repository';
import { CsAdminService } from './cs-admin.service';
import { HandoffService } from './handoff.service';

describe('CsAdminService', () => {
  let mockRepository: jest.Mocked<
    Pick<
      AdminConversationRepository,
      | 'listConversations'
      | 'findConversationById'
      | 'listMessages'
      | 'countHandoffQueue'
      | 'appendAdminMessage'
      | 'setBlocked'
    >
  >;
  let mockHandoff: jest.Mocked<Pick<HandoffService, 'takeOver' | 'release'>>;
  let mockDispatcher: jest.Mocked<Pick<OutboundMessageDispatcherService, 'sendMessage'>>;
  let csAdminService: CsAdminService;

  const actor: CurrentUser = {
    sub: 'admin-user-1',
    email: 'admin@salingjaga.com',
    roles: ['ADMIN'],
    permissions: [],
  } as unknown as CurrentUser;

  function buildConversation(
    overrides: Partial<AdminConversationRecord> = {},
  ): AdminConversationRecord {
    return {
      id: 'conversation-1',
      channel: 'TELEGRAM',
      externalChatId: '12345',
      senderDisplayName: 'Siti',
      state: 'NEEDS_HUMAN',
      blockedAt: null,
      blockedById: null,
      messageCount: 8,
      lastMessageAt: '2026-08-09T02:00:00.000Z',
      createdAt: '2026-08-09T01:30:00.000Z',
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mockRepository = {
      listConversations: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      findConversationById: jest.fn().mockResolvedValue(buildConversation()),
      listMessages: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      countHandoffQueue: jest.fn().mockResolvedValue({
        needsHumanCount: 2,
        humanActiveCount: 1,
        oldestWaitingSince: '2026-08-09T01:55:00.000Z',
      }),
      appendAdminMessage: jest.fn().mockResolvedValue({
        id: 'message-1',
        role: 'ADMIN',
        content: 'Selamat siang',
        authorUserId: 'admin-user-1',
        authorEmail: 'admin@salingjaga.com',
        safetyTags: [],
        createdAt: '2026-08-09T02:05:00.000Z',
      }),
      setBlocked: jest.fn().mockImplementation(async ({ blockedAt, blockedById }) =>
        buildConversation({ blockedAt: blockedAt?.toISOString() ?? null, blockedById }),
      ),
    };
    mockHandoff = {
      takeOver: jest.fn().mockResolvedValue(buildConversation({ state: 'HUMAN_ACTIVE' })),
      release: jest.fn().mockResolvedValue(buildConversation({ state: 'BOT_ACTIVE' })),
    };
    mockDispatcher = { sendMessage: jest.fn().mockResolvedValue(undefined) };
    csAdminService = new CsAdminService(
      mockRepository as unknown as AdminConversationRepository,
      mockHandoff as unknown as HandoffService,
      mockDispatcher as unknown as OutboundMessageDispatcherService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listing', () => {
    it('resolves HANDOFF to both halves of "a person owns this"', async () => {
      await csAdminService.listConversations({ filter: 'HANDOFF', limit: 25 });

      expect(mockRepository.listConversations).toHaveBeenCalledWith(
        expect.objectContaining({ states: ['NEEDS_HUMAN', 'HUMAN_ACTIVE'], isBlocked: false }),
      );
    });

    it('hides blocked chats from every filter but BLOCKED', async () => {
      await csAdminService.listConversations({ filter: 'ALL', limit: 25 });
      await csAdminService.listConversations({ filter: 'BLOCKED', limit: 25 });

      expect(mockRepository.listConversations).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ isBlocked: false }),
      );
      expect(mockRepository.listConversations).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ isBlocked: true }),
      );
    });

    it('reports the wait only for conversations that are actually waiting', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-09T02:05:00.000Z'));
      mockRepository.listConversations.mockResolvedValue({
        items: [
          buildConversation({ id: 'waiting', state: 'NEEDS_HUMAN' }),
          buildConversation({ id: 'answered', state: 'HUMAN_ACTIVE' }),
        ],
        nextCursor: null,
      });

      const actual = await csAdminService.listConversations({ filter: 'ALL', limit: 25 });

      expect(actual.items[0]?.waitingForSeconds).toBe(300);
      // A conversation someone is already handling is not a queue wait, and
      // showing one would have two admins racing to answer the same customer.
      expect(actual.items[1]?.waitingForSeconds).toBeNull();
      jest.useRealTimers();
    });
  });

  describe('takeover and release', () => {
    it('refuses to take over a conversation holding a live possession challenge', async () => {
      mockRepository.findConversationById.mockResolvedValue(
        buildConversation({ state: 'AWAITING_OTP' }),
      );

      await expect(csAdminService.takeOverConversation('conversation-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockHandoff.takeOver).not.toHaveBeenCalled();
    });

    it('refuses to take over a blocked conversation', async () => {
      mockRepository.findConversationById.mockResolvedValue(
        buildConversation({ blockedAt: '2026-08-08T11:02:00.000Z' }),
      );

      await expect(csAdminService.takeOverConversation('conversation-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('releases a blocked conversation, because releasing is the narrowing move', async () => {
      mockRepository.findConversationById.mockResolvedValue(
        buildConversation({ state: 'HUMAN_ACTIVE', blockedAt: '2026-08-08T11:02:00.000Z' }),
      );

      await csAdminService.releaseConversation('conversation-1');

      expect(mockHandoff.release).toHaveBeenCalledWith('conversation-1');
    });

    it('404s on a conversation that does not exist', async () => {
      mockRepository.findConversationById.mockResolvedValue(null);

      await expect(csAdminService.takeOverConversation('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('replying', () => {
    it('reaches the customer on their original channel', async () => {
      mockRepository.findConversationById.mockResolvedValue(
        buildConversation({ state: 'HUMAN_ACTIVE' }),
      );

      await csAdminService.replyToConversation(
        'conversation-1',
        { text: 'Selamat siang' },
        actor,
      );

      expect(mockDispatcher.sendMessage).toHaveBeenCalledWith({
        channel: 'TELEGRAM',
        externalChatId: '12345',
        text: 'Selamat siang',
      });
    });

    it('takes the conversation over so the bot cannot answer over the top of a person', async () => {
      mockRepository.findConversationById.mockResolvedValue(
        buildConversation({ state: 'BOT_ACTIVE' }),
      );

      await csAdminService.replyToConversation('conversation-1', { text: 'Halo' }, actor);

      expect(mockHandoff.takeOver).toHaveBeenCalledWith('conversation-1');
    });

    it('does not re-take a conversation it already holds', async () => {
      mockRepository.findConversationById.mockResolvedValue(
        buildConversation({ state: 'HUMAN_ACTIVE' }),
      );

      await csAdminService.replyToConversation('conversation-1', { text: 'Halo' }, actor);

      expect(mockHandoff.takeOver).not.toHaveBeenCalled();
    });

    it('persists the turn before dispatching it', async () => {
      mockRepository.findConversationById.mockResolvedValue(
        buildConversation({ state: 'HUMAN_ACTIVE' }),
      );
      const order: string[] = [];
      mockRepository.appendAdminMessage.mockImplementation(async () => {
        order.push('persist');
        return {
          id: 'message-1',
          role: 'ADMIN',
          content: 'Halo',
          authorUserId: 'admin-user-1',
          authorEmail: 'admin@salingjaga.com',
          safetyTags: [],
          createdAt: '2026-08-09T02:05:00.000Z',
        };
      });
      mockDispatcher.sendMessage.mockImplementation(async () => {
        order.push('dispatch');
      });

      await csAdminService.replyToConversation('conversation-1', { text: 'Halo' }, actor);

      // The same order the bot path uses: a reply the gateway failed to carry
      // is exactly the one worth having in the transcript.
      expect(order).toEqual(['persist', 'dispatch']);
    });

    it('refuses to reply into a live possession challenge', async () => {
      mockRepository.findConversationById.mockResolvedValue(
        buildConversation({ state: 'AWAITING_OTP' }),
      );

      await expect(
        csAdminService.replyToConversation('conversation-1', { text: 'Halo' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockDispatcher.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('blocking', () => {
    it('records who blocked the chat and when', async () => {
      const actual = await csAdminService.blockConversation('conversation-1', {}, actor);

      expect(mockRepository.setBlocked).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conversation-1', blockedById: 'admin-user-1' }),
      );
      expect(actual.isBlocked).toBe(true);
    });

    it('never sends the customer anything about being blocked', async () => {
      await csAdminService.blockConversation('conversation-1', { reason: 'spam' }, actor);

      // An abuser told they were blocked has a signal to tune against.
      expect(mockDispatcher.sendMessage).not.toHaveBeenCalled();
    });

    it('leaves the conversation state alone, so unblocking restores it', async () => {
      mockRepository.findConversationById.mockResolvedValue(
        buildConversation({ state: 'HUMAN_ACTIVE' }),
      );

      await csAdminService.blockConversation('conversation-1', {}, actor);

      expect(mockHandoff.takeOver).not.toHaveBeenCalled();
      expect(mockHandoff.release).not.toHaveBeenCalled();
    });

    it('refuses to block twice', async () => {
      mockRepository.findConversationById.mockResolvedValue(
        buildConversation({ blockedAt: '2026-08-08T11:02:00.000Z' }),
      );

      await expect(
        csAdminService.blockConversation('conversation-1', {}, actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses to unblock a conversation that is not blocked', async () => {
      await expect(
        csAdminService.unblockConversation('conversation-1', actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('reports the handoff queue as counts rather than rows', async () => {
    const actual = await csAdminService.getHandoffSummary();

    expect(actual).toEqual({
      needsHumanCount: 2,
      humanActiveCount: 1,
      oldestWaitingSince: '2026-08-09T01:55:00.000Z',
    });
    expect(mockRepository.listConversations).not.toHaveBeenCalled();
  });
});

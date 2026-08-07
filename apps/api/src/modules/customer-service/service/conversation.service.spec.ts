import { Logger } from '@nestjs/common';

import { ConversationRecord, ConversationStateValue, InboundChannelMessage } from '@hms/shared-types';

import { OutboundMessageDispatcherService } from '../../channel-gateway/service/outbound-message-dispatcher.service';
import { ConversationRepository } from '../repository/conversation.repository';
import { ConversationService } from './conversation.service';
import { CsSafetyPolicyService } from './cs-safety-policy.service';
import { CS_REPLY_TEMPLATES } from './cs-reply-templates';
import { IntentOrchestratorService } from './intent-orchestrator.service';

describe('ConversationService', () => {
  let mockRepository: jest.Mocked<
    Pick<
      ConversationRepository,
      | 'findOrCreateConversation'
      | 'appendMessage'
      | 'listRecentTurns'
      | 'updateState'
      | 'markNoticeSent'
      | 'countCustomerMessagesSince'
    >
  >;
  let mockOrchestrator: jest.Mocked<Pick<IntentOrchestratorService, 'composeReply' | 'config'>>;
  let mockDispatcher: jest.Mocked<Pick<OutboundMessageDispatcherService, 'sendMessage'>>;
  let conversationService: ConversationService;

  function buildConversation(
    overrides: Partial<ConversationRecord> = {},
  ): ConversationRecord {
    return {
      id: 'conversation-1',
      channel: 'TELEGRAM',
      externalChatId: '12345',
      senderDisplayName: 'Siti',
      state: 'BOT_ACTIVE',
      hasSentNotice: true,
      lastMessageAt: '2026-08-07T09:00:00.000Z',
      ...overrides,
    };
  }

  function buildMessage(text = 'Klinik buka jam berapa?'): InboundChannelMessage {
    return {
      channel: 'TELEGRAM',
      externalChatId: '12345',
      externalMessageId: '42',
      senderDisplayName: 'Siti',
      text,
      receivedAt: '2026-08-07T09:00:00.000Z',
    };
  }

  function buildService(): ConversationService {
    return new ConversationService(
      mockRepository as unknown as ConversationRepository,
      new CsSafetyPolicyService(),
      mockOrchestrator as unknown as IntentOrchestratorService,
      mockDispatcher as unknown as OutboundMessageDispatcherService,
    );
  }

  beforeEach(() => {
    mockRepository = {
      findOrCreateConversation: jest.fn().mockResolvedValue(buildConversation()),
      appendMessage: jest.fn().mockResolvedValue(undefined),
      listRecentTurns: jest.fn().mockResolvedValue([{ role: 'CUSTOMER', content: 'halo' }]),
      updateState: jest.fn().mockResolvedValue(buildConversation()),
      markNoticeSent: jest.fn().mockResolvedValue(undefined),
      countCustomerMessagesSince: jest.fn().mockResolvedValue(1),
    };
    mockOrchestrator = {
      composeReply: jest.fn().mockResolvedValue({ replyContent: 'Klinik buka pukul 08.00.' }),
      config: { historyTurnLimit: 20, rateLimitPerChatHour: 20, clinicName: 'Klinik Uji' },
    };
    mockDispatcher = { sendMessage: jest.fn().mockResolvedValue(undefined) };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    conversationService = buildService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('answers a normal question from the model and sends the reply', async () => {
    await conversationService.handleInboundMessage(buildMessage());

    expect(mockOrchestrator.composeReply).toHaveBeenCalled();
    expect(mockDispatcher.sendMessage).toHaveBeenCalledWith({
      channel: 'TELEGRAM',
      externalChatId: '12345',
      text: 'Klinik buka pukul 08.00.',
    });
  });

  it.each<[ConversationStateValue]>([
    ['NEEDS_HUMAN'],
    ['HUMAN_ACTIVE'],
    ['AWAITING_OTP'],
    ['ARCHIVED'],
  ])('records but never sends to the model while %s', async (state) => {
    mockRepository.findOrCreateConversation.mockResolvedValue(buildConversation({ state }));

    await conversationService.handleInboundMessage(buildMessage());

    // The transcript stays complete — the admin takeover screen reads it —
    // but there is no prompt for an injection to land in.
    expect(mockRepository.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'CUSTOMER' }),
    );
    expect(mockOrchestrator.composeReply).not.toHaveBeenCalled();
    expect(mockDispatcher.sendMessage).not.toHaveBeenCalled();
  });

  it('persists the customer turn already redacted', async () => {
    await conversationService.handleInboundMessage(
      buildMessage('daftar dong, NIK saya 3171020344050001'),
    );

    const [customerWrite] = mockRepository.appendMessage.mock.calls[0] ?? [];
    // The identifier must be gone by the time it lands, not stripped later.
    expect(customerWrite?.content).not.toContain('3171020344050001');
    expect(customerWrite?.safetyTags).toContain('sensitive_data_redacted');
  });

  it('never sends a redacted message on to the provider', async () => {
    await conversationService.handleInboundMessage(
      buildMessage('daftar dong, NIK saya 3171020344050001'),
    );

    expect(mockOrchestrator.composeReply).not.toHaveBeenCalled();
    expect(mockDispatcher.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: CS_REPLY_TEMPLATES.sensitiveDataVolunteered }),
    );
  });

  it('flags a conversation for a human when the safety layer says so', async () => {
    await conversationService.handleInboundMessage(buildMessage('saya mau bicara dengan petugas'));

    expect(mockRepository.updateState).toHaveBeenCalledWith('conversation-1', 'NEEDS_HUMAN');
    expect(mockOrchestrator.composeReply).not.toHaveBeenCalled();
  });

  it('answers an emergency without calling the provider', async () => {
    await conversationService.handleInboundMessage(buildMessage('dada saya sakit sekali, sesak'));

    // The right response must not depend on an upstream API being reachable.
    expect(mockOrchestrator.composeReply).not.toHaveBeenCalled();
    expect(mockDispatcher.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: CS_REPLY_TEMPLATES.emergency }),
    );
  });

  it('sends the privacy notice once, on the first exchange', async () => {
    mockRepository.findOrCreateConversation.mockResolvedValue(
      buildConversation({ hasSentNotice: false }),
    );

    await conversationService.handleInboundMessage(buildMessage());

    const sentTexts = mockDispatcher.sendMessage.mock.calls.map(([call]) => call.text);
    expect(sentTexts[0]).toBe(CS_REPLY_TEMPLATES.privacyNotice);
    expect(mockRepository.markNoticeSent).toHaveBeenCalledWith('conversation-1');
  });

  it('does not repeat the privacy notice on later messages', async () => {
    await conversationService.handleInboundMessage(buildMessage());

    const sentTexts = mockDispatcher.sendMessage.mock.calls.map(([call]) => call.text);
    expect(sentTexts).not.toContain(CS_REPLY_TEMPLATES.privacyNotice);
  });

  it('answers with the polite template once over the per-chat limit', async () => {
    mockRepository.countCustomerMessagesSince.mockResolvedValue(21);

    await conversationService.handleInboundMessage(buildMessage());

    // Over-limit costs no provider call, which is the point of the limit.
    expect(mockOrchestrator.composeReply).not.toHaveBeenCalled();
    expect(mockDispatcher.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: CS_REPLY_TEMPLATES.rateLimited }),
    );
  });

  it('falls back to a template when the provider is unreachable', async () => {
    mockOrchestrator.composeReply.mockResolvedValue({ replyContent: null });

    await conversationService.handleInboundMessage(buildMessage());

    expect(mockDispatcher.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: CS_REPLY_TEMPLATES.providerUnavailable }),
    );
  });

  it('persists a reply before dispatching it, so a failed send is still recorded', async () => {
    const callOrder: string[] = [];
    mockRepository.appendMessage.mockImplementation(async (params) => {
      callOrder.push(`persist:${params.role}`);
    });
    mockDispatcher.sendMessage.mockImplementation(async () => {
      callOrder.push('dispatch');
      throw new Error('telegram is down');
    });

    // A delivery failure must not throw: the gateway already claimed the
    // inbound message, so throwing would neither retry it nor tell anyone.
    await expect(conversationService.handleInboundMessage(buildMessage())).resolves.toBeUndefined();
    expect(callOrder).toEqual(['persist:CUSTOMER', 'persist:BOT', 'dispatch']);
  });

  it('replays no more history than the configured window', async () => {
    await conversationService.handleInboundMessage(buildMessage());

    expect(mockRepository.listRecentTurns).toHaveBeenCalledWith('conversation-1', 20);
  });
});

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TelegramWebhookUpdateInput } from '@hms/shared-types';

import { ChannelInboundReceiptRepository } from '../repository/channel-inbound-receipt.repository';
import { InboundMessageNormalizerService } from './inbound-message-normalizer.service';
import { InboundMessageSink } from './inbound-message-sink.service';
import { InboundOptOutHandler } from './inbound-opt-out-handler.service';

describe('InboundMessageNormalizerService', () => {
  let mockReceiptRepository: jest.Mocked<
    Pick<ChannelInboundReceiptRepository, 'claimInboundMessage'>
  >;
  let mockSink: jest.Mocked<InboundMessageSink>;
  let mockOptOutHandler: jest.Mocked<InboundOptOutHandler>;

  function buildUpdate(text = 'Klinik buka jam berapa?'): TelegramWebhookUpdateInput {
    return {
      update_id: 900_001,
      message: {
        message_id: 42,
        date: 1_786_006_800,
        chat: { id: 12_345, type: 'private' },
        from: { id: 12_345, is_bot: false, first_name: 'Siti' },
        text,
      },
    };
  }

  function buildService(environment: Record<string, string> = { CS_CHANNEL_ENABLED: 'true' }) {
    return new InboundMessageNormalizerService(
      new ConfigService(environment),
      mockReceiptRepository as unknown as ChannelInboundReceiptRepository,
      mockSink,
      mockOptOutHandler,
    );
  }

  beforeEach(() => {
    mockReceiptRepository = { claimInboundMessage: jest.fn().mockResolvedValue(true) };
    mockSink = { handleInboundMessage: jest.fn().mockResolvedValue(undefined) };
    mockOptOutHandler = { handleOptOut: jest.fn().mockResolvedValue(false) };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts a first delivery and hands it to the sink', async () => {
    const actualOutcome = await buildService().receiveTelegramUpdate(buildUpdate());

    expect(actualOutcome).toBe('ACCEPTED');
    expect(mockSink.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'TELEGRAM',
        externalChatId: '12345',
        text: 'Klinik buka jam berapa?',
      }),
    );
  });

  it('drops a redelivered message without handing it to the sink', async () => {
    mockReceiptRepository.claimInboundMessage.mockResolvedValue(false);

    const actualOutcome = await buildService().receiveTelegramUpdate(buildUpdate());

    // The whole reason dedup exists: a retried booking message must not book
    // twice, so the sink must never see the second copy.
    expect(actualOutcome).toBe('DUPLICATE');
    expect(mockSink.handleInboundMessage).not.toHaveBeenCalled();
  });

  it('claims the message before the sink runs, not after', async () => {
    const callOrder: string[] = [];
    mockReceiptRepository.claimInboundMessage.mockImplementation(async () => {
      callOrder.push('claim');
      return true;
    });
    mockSink.handleInboundMessage.mockImplementation(async () => {
      callOrder.push('sink');
    });

    await buildService().receiveTelegramUpdate(buildUpdate());

    // Claiming after the handoff would leave a window in which two concurrent
    // deliveries both reach the sink.
    expect(callOrder).toEqual(['claim', 'sink']);
  });

  it('does no work at all when the channel is switched off', async () => {
    const actualOutcome = await buildService({ CS_CHANNEL_ENABLED: 'false' }).receiveTelegramUpdate(
      buildUpdate(),
    );

    expect(actualOutcome).toBe('DISABLED');
    expect(mockReceiptRepository.claimInboundMessage).not.toHaveBeenCalled();
    expect(mockSink.handleInboundMessage).not.toHaveBeenCalled();
  });

  it('defaults to off when the flag is absent', async () => {
    const actualOutcome = await buildService({}).receiveTelegramUpdate(buildUpdate());

    expect(actualOutcome).toBe('DISABLED');
  });

  it('ignores an unusable update without claiming a dedup row for it', async () => {
    const actualOutcome = await buildService().receiveTelegramUpdate({ update_id: 5 });

    expect(actualOutcome).toBe('IGNORED');
    expect(mockReceiptRepository.claimInboundMessage).not.toHaveBeenCalled();
  });

  it('still reports acceptance when the downstream handler throws', async () => {
    mockSink.handleInboundMessage.mockRejectedValue(new Error('conversation service is down'));

    const actualOutcome = await buildService().receiveTelegramUpdate(buildUpdate());

    // Telegram retries anything that is not a 2xx, and the message is already
    // claimed — so a retry would be dropped as a duplicate forever. Reporting
    // acceptance and logging the fault is the honest half of that trade.
    expect(actualOutcome).toBe('ACCEPTED');
  });

  it('never puts the message body into the failure log', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mockSink.handleInboundMessage.mockRejectedValue(
      new Error('failed on "nomor BPJS saya 000123"'),
    );

    await buildService().receiveTelegramUpdate(buildUpdate('nomor BPJS saya 000123'));

    const loggedLine = String(errorSpy.mock.calls[0]?.[0] ?? '');
    expect(loggedLine).toContain('inbound_message_handler_failed');
    expect(loggedLine).not.toContain('000123');
  });

  describe('the opt-out hook (P16-T24)', () => {
    it('lets a claimed opt-out end the message before the sink', async () => {
      mockOptOutHandler.handleOptOut.mockResolvedValue(true);

      const actualOutcome = await buildService().receiveTelegramUpdate(buildUpdate('BERHENTI'));

      expect(actualOutcome).toBe('ACCEPTED');
      expect(mockOptOutHandler.handleOptOut).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'BERHENTI' }),
      );
      expect(mockSink.handleInboundMessage).not.toHaveBeenCalled();
    });

    it('hands an unclaimed message to the sink as before', async () => {
      await buildService().receiveTelegramUpdate(buildUpdate());

      expect(mockOptOutHandler.handleOptOut).toHaveBeenCalledTimes(1);
      expect(mockSink.handleInboundMessage).toHaveBeenCalledTimes(1);
    });

    it('runs after dedup, so a retried opt-out is not confirmed twice', async () => {
      mockReceiptRepository.claimInboundMessage.mockResolvedValue(false);

      await buildService().receiveTelegramUpdate(buildUpdate('STOP'));

      expect(mockOptOutHandler.handleOptOut).not.toHaveBeenCalled();
    });

    it('falls through to the sink when the handler fails, without the body in the log', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mockOptOutHandler.handleOptOut.mockRejectedValue(new Error('failed on "BERHENTI 0812"'));

      const actualOutcome = await buildService().receiveTelegramUpdate(
        buildUpdate('BERHENTI 0812'),
      );

      expect(actualOutcome).toBe('ACCEPTED');
      expect(mockSink.handleInboundMessage).toHaveBeenCalledTimes(1);
      const loggedLine = String(errorSpy.mock.calls[0]?.[0] ?? '');
      expect(loggedLine).toContain('inbound_opt_out_handler_failed');
      expect(loggedLine).not.toContain('0812');
    });

    it('works with no handler registered at all', async () => {
      const service = new InboundMessageNormalizerService(
        new ConfigService({ CS_CHANNEL_ENABLED: 'true' }),
        mockReceiptRepository as unknown as ChannelInboundReceiptRepository,
        mockSink,
      );

      const actualOutcome = await service.receiveTelegramUpdate(buildUpdate());

      expect(actualOutcome).toBe('ACCEPTED');
      expect(mockSink.handleInboundMessage).toHaveBeenCalledTimes(1);
    });
  });

  it('propagates a dedup store failure rather than reporting a duplicate', async () => {
    mockReceiptRepository.claimInboundMessage.mockRejectedValue(new Error('connection refused'));

    // "The database is unreachable" reported as "already seen" would silently
    // drop a message nobody ever handled.
    await expect(buildService().receiveTelegramUpdate(buildUpdate())).rejects.toThrow();
  });
});

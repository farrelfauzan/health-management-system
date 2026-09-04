import { ServiceUnavailableException } from '@nestjs/common';

import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import { WhatsappGatewayService } from '../infrastructure/whatsapp-gateway.service';
import { OutboundMessageDispatcherService } from './outbound-message-dispatcher.service';

describe('OutboundMessageDispatcherService', () => {
  let mockTelegramGateway: jest.Mocked<TelegramGatewayService>;
  let mockWhatsappGateway: jest.Mocked<WhatsappGatewayService>;

  beforeEach(() => {
    mockTelegramGateway = { sendText: jest.fn().mockResolvedValue(undefined) };
    mockWhatsappGateway = {
      sendText: jest.fn().mockResolvedValue(undefined),
      sendDocument: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('sends a Telegram reply through the Telegram adapter', async () => {
    const dispatcher = new OutboundMessageDispatcherService(mockTelegramGateway);

    await dispatcher.sendMessage({
      channel: 'TELEGRAM',
      externalChatId: '12345',
      text: 'Klinik buka pukul 08.00.',
    });

    expect(mockTelegramGateway.sendText).toHaveBeenCalledWith({
      externalChatId: '12345',
      text: 'Klinik buka pukul 08.00.',
    });
  });

  it('refuses a WhatsApp reply while no adapter is bound', async () => {
    const dispatcher = new OutboundMessageDispatcherService(mockTelegramGateway);

    // Failing loudly beats the two alternatives: silently dropping the reply,
    // or falling through to Telegram and delivering it to the wrong customer.
    await expect(
      dispatcher.sendMessage({
        channel: 'WHATSAPP',
        externalChatId: '628123@s.whatsapp.net',
        text: 'halo',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(mockTelegramGateway.sendText).not.toHaveBeenCalled();
  });

  it('sends a WhatsApp reply through the WhatsApp adapter once one is bound', async () => {
    const dispatcher = new OutboundMessageDispatcherService(
      mockTelegramGateway,
      mockWhatsappGateway,
    );

    await dispatcher.sendMessage({
      channel: 'WHATSAPP',
      externalChatId: '628123@s.whatsapp.net',
      text: 'halo',
    });

    // Pins the PCS-T09 seam: binding an adapter is all that is required, and
    // this file does not change.
    expect(mockWhatsappGateway.sendText).toHaveBeenCalledWith({
      externalChatId: '628123@s.whatsapp.net',
      text: 'halo',
    });
    expect(mockTelegramGateway.sendText).not.toHaveBeenCalled();
  });
});

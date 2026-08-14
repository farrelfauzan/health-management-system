import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';

import { TelegramWebhookAdminService } from './telegram-webhook-admin.service';
import { TELEGRAM_WEBHOOK_ROUTE } from './telegram-webhook-route';

type WebhookInfoStub = {
  url?: string;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
};

describe('TelegramWebhookAdminService', () => {
  const inputDomain = 'klinik.example.id';
  const expectedUrl = `https://${inputDomain}${TELEGRAM_WEBHOOK_ROUTE.publicPath}`;

  function buildService(
    overrides: Record<string, string> = {},
  ): { service: TelegramWebhookAdminService; api: { getWebhookInfo: jest.Mock; setWebhook: jest.Mock } } {
    const configService = new ConfigService({
      CS_CHANNEL_ENABLED: 'true',
      HMS_DOMAIN: inputDomain,
      TELEGRAM_BOT_TOKEN: 'bot-token',
      TELEGRAM_WEBHOOK_SECRET: 'secret',
      ...overrides,
    });
    const service = new TelegramWebhookAdminService(configService);
    const api = {
      getWebhookInfo: jest.fn(),
      setWebhook: jest.fn().mockResolvedValue(true),
    };
    Object.defineProperty(service, 'api', { value: api, writable: true });
    return { service, api };
  }

  function buildInfo(overrides: Partial<WebhookInfoStub> = {}): WebhookInfoStub {
    return { url: expectedUrl, pending_update_count: 0, ...overrides };
  }

  it('derives the expected url from HMS_DOMAIN and the served route', async () => {
    const { service, api } = buildService();
    api.getWebhookInfo.mockResolvedValue(buildInfo());

    const actualHealth = await service.readHealth();

    expect(actualHealth.expectedUrl).toBe(expectedUrl);
    expect(actualHealth.isMatching).toBe(true);
  });

  it.each([
    ['https://klinik.example.id', 'a scheme'],
    ['klinik.example.id/', 'a trailing slash'],
    ['https://klinik.example.id/api', 'a path'],
  ])('normalises %s, pasted with %s', async (inputHmsDomain) => {
    const { service, api } = buildService({ HMS_DOMAIN: inputHmsDomain });
    api.getWebhookInfo.mockResolvedValue(buildInfo());

    const actualHealth = await service.readHealth();

    expect(actualHealth.expectedUrl).toBe(expectedUrl);
  });

  /**
   * A bot token has one webhook globally, so a second environment registering
   * with the same token silently takes the traffic. Nothing errors — this flag
   * is the only place it becomes visible.
   */
  it('reports a mismatch when another deployment holds the webhook', async () => {
    const { service, api } = buildService();
    api.getWebhookInfo.mockResolvedValue(
      buildInfo({ url: `https://staging.example.id${TELEGRAM_WEBHOOK_ROUTE.publicPath}` }),
    );

    const actualHealth = await service.readHealth();

    expect(actualHealth.isMatching).toBe(false);
    expect(actualHealth.registeredUrl).toContain('staging.example.id');
  });

  it('treats an empty url as no registration rather than a url', async () => {
    const { service, api } = buildService();
    api.getWebhookInfo.mockResolvedValue(buildInfo({ url: '' }));

    const actualHealth = await service.readHealth();

    expect(actualHealth.registeredUrl).toBeNull();
    expect(actualHealth.isMatching).toBe(false);
  });

  /**
   * Telegram never clears `last_error_message` on a successful delivery, only
   * overwrites it on the next failure. Read without a clock, a resolved outage
   * looks live forever.
   */
  it('marks a remembered error stale when nothing is pending', async () => {
    const { service, api } = buildService();
    api.getWebhookInfo.mockResolvedValue(
      buildInfo({
        pending_update_count: 0,
        last_error_date: 1_786_702_949,
        last_error_message: 'Wrong response from the webhook: 401 Unauthorized',
      }),
    );

    const actualHealth = await service.readHealth();

    expect(actualHealth.isLastErrorStale).toBe(true);
    expect(actualHealth.lastErrorMessage).toContain('401');
  });

  it('does not mark an error stale while updates are still queued', async () => {
    const { service, api } = buildService();
    api.getWebhookInfo.mockResolvedValue(
      buildInfo({
        pending_update_count: 4,
        last_error_date: 1_786_702_949,
        last_error_message: 'Wrong response from the webhook: 500 Internal Server Error',
      }),
    );

    const actualHealth = await service.readHealth();

    expect(actualHealth.isLastErrorStale).toBe(false);
  });

  it('reports unconfigured without calling Telegram at all', async () => {
    const { service, api } = buildService({ TELEGRAM_WEBHOOK_SECRET: '' });

    const actualHealth = await service.readHealth();

    expect(actualHealth.isConfigured).toBe(false);
    expect(api.getWebhookInfo).not.toHaveBeenCalled();
  });

  it('answers with an unregistered health rather than throwing when Telegram is unreachable', async () => {
    const { service, api } = buildService();
    api.getWebhookInfo.mockRejectedValue(new Error('network down'));

    // A status card that errors looks exactly like one nobody loaded.
    const actualHealth = await service.readHealth();

    expect(actualHealth.registeredUrl).toBeNull();
    expect(actualHealth.isConfigured).toBe(true);
  });

  it('registers with the derived url and the configured secret', async () => {
    const { service, api } = buildService();
    api.getWebhookInfo.mockResolvedValue(buildInfo());

    await service.registerWebhook();

    expect(api.setWebhook).toHaveBeenCalledWith(expectedUrl, { secret_token: 'secret' });
  });

  /**
   * `setWebhook` answers ok for any well-formed url — Telegram does not check
   * that the host is yours. Without the read-back, a mistyped HMS_DOMAIN would
   * report success and fail silently at the first customer message.
   */
  it('fails when Telegram accepted the call but is not pointing here', async () => {
    const { service, api } = buildService();
    api.getWebhookInfo.mockResolvedValue(
      buildInfo({ url: `https://elsewhere.example.id${TELEGRAM_WEBHOOK_ROUTE.publicPath}` }),
    );

    await expect(service.registerWebhook()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('refuses to register when no domain is configured', async () => {
    const { service, api } = buildService({ HMS_DOMAIN: '' });

    await expect(service.registerWebhook()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(api.setWebhook).not.toHaveBeenCalled();
  });
});

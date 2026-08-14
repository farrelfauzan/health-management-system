import { describe, expect, it } from 'vitest';

import type { TelegramWebhookHealth } from '@hms/shared-types';

import { resolveTelegramWebhookStatus } from './resolve-telegram-webhook-status';

describe('resolveTelegramWebhookStatus', () => {
  const expectedUrl = 'https://klinik.example.id/api/v1/channels/telegram/webhook';

  function buildHealth(overrides: Partial<TelegramWebhookHealth> = {}): TelegramWebhookHealth {
    return {
      isConfigured: true,
      isChannelEnabled: true,
      registeredUrl: expectedUrl,
      expectedUrl,
      isMatching: true,
      pendingUpdateCount: 0,
      lastErrorAt: null,
      lastErrorMessage: null,
      isLastErrorStale: false,
      checkedAt: '2026-08-14T13:00:00.000Z',
      ...overrides,
    };
  }

  it('reports healthy when Telegram points here and the channel is on', () => {
    expect(resolveTelegramWebhookStatus(buildHealth())).toBe('HEALTHY');
  });

  it('separates a switched-off channel from a broken one', () => {
    expect(resolveTelegramWebhookStatus(buildHealth({ isChannelEnabled: false }))).toBe('PAUSED');
  });

  it('reports nothing registered', () => {
    expect(
      resolveTelegramWebhookStatus(buildHealth({ registeredUrl: null, isMatching: false })),
    ).toBe('UNREGISTERED');
  });

  /**
   * One bot has one webhook globally. Another environment registering the same
   * token takes the traffic without erroring anywhere, so this must outrank a
   * reading that otherwise looks perfectly healthy.
   */
  it('reports a hijacked webhook even though delivery is succeeding', () => {
    const inputHealth = buildHealth({
      registeredUrl: 'https://staging.example.id/api/v1/channels/telegram/webhook',
      isMatching: false,
      pendingUpdateCount: 0,
    });

    expect(resolveTelegramWebhookStatus(inputHealth)).toBe('HIJACKED');
  });

  it('reports failing delivery only while updates are actually queued', () => {
    const inputHealth = buildHealth({
      pendingUpdateCount: 7,
      lastErrorAt: '2026-08-14T12:59:00.000Z',
      lastErrorMessage: 'Wrong response from the webhook: 500',
      isLastErrorStale: false,
    });

    expect(resolveTelegramWebhookStatus(inputHealth)).toBe('DELIVERY_FAILING');
  });

  /**
   * The misreading this whole flag exists to prevent: Telegram never clears
   * its last error, so a resolved fault would otherwise show as an outage
   * forever.
   */
  it('stays healthy when the only error is one Telegram still remembers', () => {
    const inputHealth = buildHealth({
      pendingUpdateCount: 0,
      lastErrorAt: '2026-08-14T10:23:00.000Z',
      lastErrorMessage: 'Wrong response from the webhook: 401 Unauthorized',
      isLastErrorStale: true,
    });

    expect(resolveTelegramWebhookStatus(inputHealth)).toBe('HEALTHY');
  });

  it('names the missing domain rather than the missing registration', () => {
    const inputHealth = buildHealth({
      expectedUrl: null,
      registeredUrl: null,
      isMatching: false,
    });

    // Both are true, but telling somebody to press a button that cannot work
    // is worse than telling them what to configure.
    expect(resolveTelegramWebhookStatus(inputHealth)).toBe('NO_DOMAIN');
  });

  it('reports an unconfigured channel before anything else', () => {
    const inputHealth = buildHealth({
      isConfigured: false,
      expectedUrl: null,
      registeredUrl: null,
      isMatching: false,
    });

    expect(resolveTelegramWebhookStatus(inputHealth)).toBe('NOT_CONFIGURED');
  });
});

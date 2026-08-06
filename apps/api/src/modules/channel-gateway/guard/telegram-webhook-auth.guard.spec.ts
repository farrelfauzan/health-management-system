import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TelegramWebhookAuthGuard } from './telegram-webhook-auth.guard';

describe('TelegramWebhookAuthGuard', () => {
  const CONFIGURED_SECRET = 'a-long-random-webhook-secret';

  function buildContext(headers: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext;
  }

  function buildGuard(secret: string): TelegramWebhookAuthGuard {
    return new TelegramWebhookAuthGuard(
      new ConfigService({ TELEGRAM_WEBHOOK_SECRET: secret }),
    );
  }

  it('admits a request carrying the configured secret', () => {
    const actualResult = buildGuard(CONFIGURED_SECRET).canActivate(
      buildContext({ 'x-telegram-bot-api-secret-token': CONFIGURED_SECRET }),
    );

    expect(actualResult).toBe(true);
  });

  it('refuses a wrong secret', () => {
    expect(() =>
      buildGuard(CONFIGURED_SECRET).canActivate(
        buildContext({ 'x-telegram-bot-api-secret-token': 'not-the-secret-at-all' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('refuses a request with no secret header', () => {
    expect(() => buildGuard(CONFIGURED_SECRET).canActivate(buildContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('refuses every request when no secret is configured', () => {
    // The failure worth designing against: a deployment that never set the
    // variable must not be running an open public endpoint.
    expect(() => buildGuard('').canActivate(buildContext({}))).toThrow(UnauthorizedException);
  });

  it('refuses an empty header even when no secret is configured', () => {
    // An empty header compared against an empty secret would otherwise be
    // equal, and the whole check would pass by accident.
    expect(() =>
      buildGuard('').canActivate(buildContext({ 'x-telegram-bot-api-secret-token': '' })),
    ).toThrow(UnauthorizedException);
  });

  it('refuses a secret that is a prefix of the configured one', () => {
    expect(() =>
      buildGuard(CONFIGURED_SECRET).canActivate(
        buildContext({ 'x-telegram-bot-api-secret-token': CONFIGURED_SECRET.slice(0, -1) }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('refuses a repeated header, which arrives as an array', () => {
    expect(() =>
      buildGuard(CONFIGURED_SECRET).canActivate(
        buildContext({ 'x-telegram-bot-api-secret-token': [CONFIGURED_SECRET] }),
      ),
    ).toThrow(UnauthorizedException);
  });
});

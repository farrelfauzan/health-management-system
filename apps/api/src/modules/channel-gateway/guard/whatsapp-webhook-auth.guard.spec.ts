import { createHmac } from 'node:crypto';

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { WhatsappWebhookAuthGuard } from './whatsapp-webhook-auth.guard';

describe('WhatsappWebhookAuthGuard', () => {
  const inputSecret = 'a-very-secret-webhook-key';
  const inputBody = Buffer.from(
    JSON.stringify({ event: 'message', payload: { id: 'x', chat_id: 'y' } }),
    'utf8',
  );

  function signBody(body: Buffer, secret: string): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  function buildContext(params: {
    signature?: string;
    rawBody?: Buffer;
  }): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers:
            params.signature === undefined
              ? {}
              : { 'x-hub-signature-256': params.signature },
          rawBody: params.rawBody,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  function buildGuard(secret: string): WhatsappWebhookAuthGuard {
    return new WhatsappWebhookAuthGuard(
      new ConfigService({ WA_GATEWAY_WEBHOOK_SECRET: secret }),
    );
  }

  it('accepts a body signed with the configured secret', () => {
    const guard = buildGuard(inputSecret);

    const actual = guard.canActivate(
      buildContext({ signature: signBody(inputBody, inputSecret), rawBody: inputBody }),
    );

    expect(actual).toBe(true);
  });

  it('accepts a signature sent without the sha256= prefix', () => {
    const guard = buildGuard(inputSecret);
    const bareDigest = createHmac('sha256', inputSecret).update(inputBody).digest('hex');

    expect(guard.canActivate(buildContext({ signature: bareDigest, rawBody: inputBody }))).toBe(
      true,
    );
  });

  it('refuses a signature computed with the wrong secret', () => {
    const guard = buildGuard(inputSecret);

    expect(() =>
      guard.canActivate(
        buildContext({ signature: signBody(inputBody, 'not-the-secret'), rawBody: inputBody }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('refuses a valid signature over a different body', () => {
    const guard = buildGuard(inputSecret);
    const tamperedBody = Buffer.from(
      JSON.stringify({ event: 'message', payload: { id: 'x', chat_id: 'attacker' } }),
      'utf8',
    );

    // The whole reason the guard reads `rawBody`: a replayed signature is only
    // as good as the bytes it was computed over.
    expect(() =>
      guard.canActivate(
        buildContext({ signature: signBody(inputBody, inputSecret), rawBody: tamperedBody }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('refuses a request with no signature header', () => {
    const guard = buildGuard(inputSecret);

    expect(() => guard.canActivate(buildContext({ rawBody: inputBody }))).toThrow(
      UnauthorizedException,
    );
  });

  it('refuses everything when the secret is unconfigured', () => {
    const guard = buildGuard('');

    // Including a correctly signed body: an unset secret closes the endpoint
    // rather than opening it, because a deployment that never set the variable
    // would otherwise be running an unauthenticated public endpoint that can
    // book appointments.
    expect(() =>
      guard.canActivate(buildContext({ signature: signBody(inputBody, ''), rawBody: inputBody })),
    ).toThrow(UnauthorizedException);
  });

  it('refuses when the raw body is unavailable', () => {
    const guard = buildGuard(inputSecret);

    // Means `rawBody` is off in bootstrap. Refusing is still correct —
    // accepting unsigned bodies is the alternative.
    expect(() =>
      guard.canActivate(buildContext({ signature: signBody(inputBody, inputSecret) })),
    ).toThrow(UnauthorizedException);
  });

  it('refuses a malformed hex signature without throwing on the decode', () => {
    const guard = buildGuard(inputSecret);

    // `Buffer.from('zz…', 'hex')` truncates silently, so an implementation
    // that decoded before comparing could end up comparing two empty buffers.
    expect(() =>
      guard.canActivate(buildContext({ signature: 'sha256=zzzz', rawBody: inputBody })),
    ).toThrow(UnauthorizedException);
  });
});

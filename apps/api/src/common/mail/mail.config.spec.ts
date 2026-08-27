import { ConfigService } from '@nestjs/config';

import { resolveMailConfig } from './mail.config';

function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  return new ConfigService({ ...overrides });
}

describe('resolveMailConfig', () => {
  // A fresh checkout has no SMTP account. Falling back to the log transport is
  // what lets a developer walk the invitation flow; failing at boot, or
  // selecting SMTP against an empty host, would both make it unwalkable.
  it('selects the log transport when no host is configured', () => {
    const actualConfig = resolveMailConfig(buildConfigService());

    expect(actualConfig.transport).toBe('log');
  });

  it('selects SMTP as soon as a host is configured', () => {
    const actualConfig = resolveMailConfig(buildConfigService({ MAIL_HOST: 'smtp.example' }));

    expect(actualConfig.transport).toBe('smtp');
  });

  it('lets MAIL_TRANSPORT override the inference', () => {
    const actualConfig = resolveMailConfig(
      buildConfigService({ MAIL_HOST: 'smtp.example', MAIL_TRANSPORT: 'log' }),
    );

    expect(actualConfig.transport).toBe('log');
  });

  it('refuses an SMTP transport with no host', () => {
    expect(() => resolveMailConfig(buildConfigService({ MAIL_TRANSPORT: 'smtp' }))).toThrow(
      /MAIL_HOST is required/,
    );
  });

  it('infers implicit TLS from the conventional SMTPS port', () => {
    const actualConfig = resolveMailConfig(
      buildConfigService({ MAIL_HOST: 'smtp.example', MAIL_PORT: '465' }),
    );

    expect(actualConfig.secure).toBe(true);
  });

  it('leaves port 587 on STARTTLS rather than implicit TLS', () => {
    const actualConfig = resolveMailConfig(
      buildConfigService({ MAIL_HOST: 'smtp.example', MAIL_PORT: '587' }),
    );

    expect(actualConfig.secure).toBe(false);
  });

  it('honours an explicit MAIL_SECURE over the port inference', () => {
    const actualConfig = resolveMailConfig(
      buildConfigService({ MAIL_HOST: 'smtp.example', MAIL_PORT: '465', MAIL_SECURE: 'false' }),
    );

    expect(actualConfig.secure).toBe(false);
  });

  it('reads credentials when both halves are present', () => {
    const actualConfig = resolveMailConfig(
      buildConfigService({
        MAIL_HOST: 'smtp.example',
        MAIL_USER: 'apikey',
        MAIL_PASSWORD: 'secret-value',
      }),
    );

    expect(actualConfig.auth).toEqual({ user: 'apikey', password: 'secret-value' });
  });

  it('leaves auth unset when neither half is present', () => {
    const actualConfig = resolveMailConfig(buildConfigService({ MAIL_HOST: 'smtp.example' }));

    expect(actualConfig.auth).toBeUndefined();
  });

  // A user with no password authenticates as nobody, and the provider-side
  // rejection reads like a network fault. Failing at boot keeps the cause
  // legible.
  it('refuses a half-filled credential pair', () => {
    expect(() =>
      resolveMailConfig(buildConfigService({ MAIL_HOST: 'smtp.example', MAIL_USER: 'apikey' })),
    ).toThrow(/MAIL_USER and MAIL_PASSWORD must be set together/);
  });

  it('refuses a non-numeric port', () => {
    expect(() =>
      resolveMailConfig(buildConfigService({ MAIL_HOST: 'smtp.example', MAIL_PORT: 'ssl' })),
    ).toThrow(/MAIL_PORT must be a positive integer/);
  });
});

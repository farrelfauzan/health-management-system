import { ConfigService } from '@nestjs/config';

import { JwtSecretsService } from './jwt-secrets.service';

/**
 * A config source that sees only what the test gives it. A real `ConfigService`
 * falls through to `process.env`, which makes these cases pass or fail
 * depending on the ambient environment — CI sets `JWT_ACCESS_SECRET`, a
 * developer shell usually does not, and the "missing secret" case then proves
 * nothing.
 */
function buildConfigService(env: Record<string, string>): ConfigService {
  return { get: (key: string): string | undefined => env[key] } as unknown as ConfigService;
}

function buildService(env: Record<string, string>): JwtSecretsService {
  return new JwtSecretsService(buildConfigService(env));
}

describe('JwtSecretsService', () => {
  it('signs with the current secret', () => {
    const service = buildService({ JWT_ACCESS_SECRET: 'current', JWT_REFRESH_SECRET: 'r-current' });

    expect(service.getAccessSigningSecret()).toBe('current');
    expect(service.getRefreshSigningSecret()).toBe('r-current');
  });

  it('verifies against the current secret alone when nothing is retired', () => {
    const service = buildService({ JWT_ACCESS_SECRET: 'current', JWT_REFRESH_SECRET: 'r-current' });

    expect(service.getAccessVerificationSecrets()).toEqual(['current']);
    expect(service.getRefreshVerificationSecrets()).toEqual(['r-current']);
  });

  /**
   * The steady state is a match on the first key, so it has to come first —
   * otherwise every request pays a failed verification before succeeding.
   */
  it('puts the signing secret ahead of retired ones', () => {
    const service = buildService({
      JWT_ACCESS_SECRET: 'current',
      JWT_REFRESH_SECRET: 'r-current',
      JWT_ACCESS_SECRET_PREVIOUS: 'previous',
    });

    expect(service.getAccessVerificationSecrets()).toEqual(['current', 'previous']);
  });

  it('accepts several retired keys so an interrupted rotation can be resumed', () => {
    const service = buildService({
      JWT_ACCESS_SECRET: 'current',
      JWT_REFRESH_SECRET: 'r-current',
      JWT_ACCESS_SECRET_PREVIOUS: 'previous-one, previous-two ,previous-three',
    });

    expect(service.getAccessVerificationSecrets()).toEqual([
      'current',
      'previous-one',
      'previous-two',
      'previous-three',
    ]);
  });

  it('ignores blank entries from a trailing comma', () => {
    const service = buildService({
      JWT_ACCESS_SECRET: 'current',
      JWT_REFRESH_SECRET: 'r-current',
      JWT_ACCESS_SECRET_PREVIOUS: 'previous,, ,',
    });

    expect(service.getAccessVerificationSecrets()).toEqual(['current', 'previous']);
  });

  it('never lists the same secret twice when a rotation is rolled back', () => {
    const service = buildService({
      JWT_ACCESS_SECRET: 'current',
      JWT_REFRESH_SECRET: 'r-current',
      JWT_ACCESS_SECRET_PREVIOUS: 'current',
    });

    expect(service.getAccessVerificationSecrets()).toEqual(['current']);
  });

  it('keeps the two token families apart', () => {
    const service = buildService({
      JWT_ACCESS_SECRET: 'access',
      JWT_REFRESH_SECRET: 'refresh',
      JWT_ACCESS_SECRET_PREVIOUS: 'old-access',
      JWT_REFRESH_SECRET_PREVIOUS: 'old-refresh',
    });

    expect(service.getAccessVerificationSecrets()).toEqual(['access', 'old-access']);
    expect(service.getRefreshVerificationSecrets()).toEqual(['refresh', 'old-refresh']);
  });

  /**
   * Unreachable in a booted app — `validateEnvironment` fails first — but the
   * getter must not invent a key if it is ever called another way.
   */
  it('throws rather than inventing a secret when one is missing', () => {
    const service = buildService({});

    expect(() => service.getAccessSigningSecret()).toThrow(/JWT_ACCESS_SECRET is not configured/);
  });
});

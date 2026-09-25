import { renderErrorEnvelope } from '../../../common/observability/render-error-envelope';
import { AuthRepository } from '../repository/auth.repository';
import { LoginThrottleService } from './login-throttle.service';

describe('LoginThrottleService', () => {
  const authRepositoryMock = {
    countLoginAttemptsFromIp: jest.fn(),
    findRecentLoginAttempts: jest.fn(),
    createLoginAttempt: jest.fn(),
  };
  const service = new LoginThrottleService(authRepositoryMock as unknown as AuthRepository);
  const inputIdentifierHash = service.hashIdentifier('front-desk@example.test');

  beforeEach(() => {
    jest.clearAllMocks();
    authRepositoryMock.countLoginAttemptsFromIp.mockResolvedValue(0);
    authRepositoryMock.findRecentLoginAttempts.mockResolvedValue([]);
  });

  it('lets an attempt through while both budgets remain', async () => {
    await expect(
      service.assertWithinLimits({ identifierHash: inputIdentifierHash, ipAddress: '198.51.100.1' }),
    ).resolves.toBeUndefined();
  });

  it('renders the per-IP refusal as the documented envelope with the wait', async () => {
    authRepositoryMock.countLoginAttemptsFromIp.mockResolvedValue(10);

    const actualError = await service
      .assertWithinLimits({ identifierHash: inputIdentifierHash, ipAddress: '198.51.100.1' })
      .catch((error: unknown) => error);

    expect(renderErrorEnvelope(actualError)).toEqual({
      status: 429,
      body: {
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many login attempts. Try again later.',
          details: { retryAfterSeconds: 60 },
        },
      },
    });
  });

  it('renders the account backoff with the seconds still to wait', async () => {
    const recentFailure = { succeeded: false, createdAt: new Date() };
    authRepositoryMock.findRecentLoginAttempts.mockResolvedValue(
      Array.from({ length: 6 }, () => recentFailure),
    );

    const actualError = await service
      .assertAccountWithinLimits(inputIdentifierHash)
      .catch((error: unknown) => error);
    const actual = renderErrorEnvelope(actualError);

    expect(actual.status).toBe(429);
    expect(actual.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(actual.body.error.message).toBe('Too many login attempts. Try again later.');
    expect(actual.body.error.details).toEqual({ retryAfterSeconds: expect.any(Number) });
    expect(
      (actual.body.error.details as { retryAfterSeconds: number }).retryAfterSeconds,
    ).toBeGreaterThan(0);
  });
});

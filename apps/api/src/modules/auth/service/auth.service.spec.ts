import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { JwtPayload } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { JwtSecretsService } from '../../../common/config/jwt-secrets.service';
import { PasswordHasherService } from '../../../common/crypto/password-hasher.service';
import { LoginThrottleService } from './login-throttle.service';
import { RequestContext } from '../../../common/observability/observability.types';
import { AuthRepository } from '../repository/auth.repository';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const TEST_ORIGIN: RequestContext = {
    ipAddress: '203.0.113.9',
    requestId: 'req-auth-spec',
    userAgent: 'jest',
  };
  const userId = '41f5da47-4151-4871-a391-106e7da1c02c';
  const authRepositoryMock = {
    findUserByEmail: jest.fn(),
    findUserById: jest.fn(),
    createRefreshToken: jest.fn(),
    createLoginAttempt: jest.fn(),
    findRecentLoginAttempts: jest.fn().mockResolvedValue([]),
    countLoginAttemptsFromIp: jest.fn().mockResolvedValue(0),
    updateUserPasswordHash: jest.fn(),
    consumeRefreshToken: jest.fn(),
    findRefreshTokenFamilyByHash: jest.fn(),
    revokeRefreshTokenFamily: jest.fn(),
    revokeAllUserRefreshTokens: jest.fn(),
  } as unknown as AuthRepository;
  const jwtService = new JwtService();
  const configService = new ConfigService({
    JWT_ACCESS_SECRET: 'test-access-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  });
  const auditServiceMock = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
  // Real service over the same ConfigService the suite already builds, so the
  // rotation path is exercised rather than stubbed away.
  const jwtSecretsService = new JwtSecretsService(configService);
  const passwordHasher = new PasswordHasherService();
  const service = new AuthService(
    authRepositoryMock,
    jwtService,
    configService,
    auditServiceMock,
    jwtSecretsService,
    passwordHasher,
    new LoginThrottleService(authRepositoryMock),
  );
  const user = {
    id: userId,
    email: 'admin@hms.local',
    passwordHash: '',
    roles: [
      {
        unassignedAt: null,
        role: {
          code: 'ADMIN',
          permissions: [
            { permission: { permissionKey: 'patient.read:any' } },
            { permission: { permissionKey: 'encounter.write:any' } },
          ],
        },
      },
      {
        // Still-assigned second role sharing one permission with the first,
        // so the de-duplication in the claim is exercised.
        unassignedAt: null,
        role: {
          code: 'DOCTOR',
          permissions: [{ permission: { permissionKey: 'encounter.write:any' } }],
        },
      },
      {
        unassignedAt: new Date('2026-01-01T00:00:00.000Z'),
        role: {
          code: 'PHARMACIST',
          permissions: [{ permission: { permissionKey: 'dispense.write:any' } }],
        },
      },
    ],
  };

  beforeAll(async () => {
    user.passwordHash = await passwordHasher.hashPassword('password123');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (authRepositoryMock.findUserByEmail as jest.Mock).mockResolvedValue(user);
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(user);
    (authRepositoryMock.findRefreshTokenFamilyByHash as jest.Mock).mockResolvedValue({
      familyId: 'family-1',
      userId,
    });
    (authRepositoryMock.consumeRefreshToken as jest.Mock).mockResolvedValue({
      outcome: 'ROTATED',
      userId,
      familyId: 'family-1',
    });
  });

  it('carries the granted permissions on the access token, de-duplicated', async () => {
    const actualTokens = await service.login({
      email: user.email,
      password: 'password123',
    }, TEST_ORIGIN);
    const accessPayload = await jwtService.verifyAsync<JwtPayload>(actualTokens.tokens.accessToken, {
      secret: 'test-access-secret',
    });

    expect(accessPayload.permissions).toEqual(['encounter.write:any', 'patient.read:any']);
    expect(accessPayload.roles).toEqual(['ADMIN', 'DOCTOR']);
    expect(JSON.stringify((auditServiceMock.record as jest.Mock).mock.calls)).not.toContain(
      user.email,
    );
  });

  it('does not audit the supplied email when login fails', async () => {
    (authRepositoryMock.findUserByEmail as jest.Mock).mockResolvedValue(null);

    await expect(
      service.login({ email: 'pii-sentinel@example.com', password: 'wrong-password' }, TEST_ORIGIN),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_LOGIN_FAILED' }),
    );
    expect(JSON.stringify((auditServiceMock.record as jest.Mock).mock.calls)).not.toContain(
      'pii-sentinel@example.com',
    );
  });

  it('omits permissions granted only by an unassigned role', async () => {
    const actualTokens = await service.login({
      email: user.email,
      password: 'password123',
    }, TEST_ORIGIN);
    const accessPayload = await jwtService.verifyAsync<JwtPayload>(actualTokens.tokens.accessToken, {
      secret: 'test-access-secret',
    });

    expect(accessPayload.permissions).not.toContain('dispense.write:any');
  });

  /**
   * SJ-6: the refresh token stopped being a JWT. It is 256 bits of randomness
   * with no structure at all, which is the property these cases pin — a token
   * that decodes to anything is a token that tells its holder who they are.
   */
  it('issues an opaque refresh token carrying no readable claims', async () => {
    const actualSession = await service.login(
      { email: user.email, password: 'password123' },
      TEST_ORIGIN,
    );

    expect(actualSession.refreshToken).not.toContain('.');
    expect(() => JSON.parse(Buffer.from(actualSession.refreshToken, 'base64url').toString('utf8')))
      .toThrow();
    expect(Buffer.from(actualSession.refreshToken, 'base64url')).toHaveLength(32);
  });

  it('never returns the refresh token in the response body', async () => {
    const actualSession = await service.login(
      { email: user.email, password: 'password123' },
      TEST_ORIGIN,
    );

    expect(Object.keys(actualSession.tokens)).toEqual(['accessToken', 'tokenType', 'expiresIn']);
  });

  it('re-reads permissions from the database when refreshing', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValueOnce({
      ...user,
      roles: [
        {
          unassignedAt: null,
          role: { code: 'ADMIN', permissions: [{ permission: { permissionKey: 'user.read:any' } }] },
        },
      ],
    });

    const actualSession = await service.refresh('any-opaque-token', TEST_ORIGIN);

    const accessPayload = await jwtService.verifyAsync<JwtPayload>(
      actualSession.tokens.accessToken,
      { secret: 'test-access-secret' },
    );
    expect(accessPayload.permissions).toEqual(['user.read:any']);
  });

  it('persists only a hash of the refresh token, never the token itself', async () => {
    const actualSession = await service.login(
      { email: user.email, password: 'password123' },
      TEST_ORIGIN,
    );

    const [storedRecord] = (authRepositoryMock.createRefreshToken as jest.Mock).mock.calls[0] as [
      { tokenHash: string; userId: string; familyId: string },
    ];
    const expectedHash = createHash('sha256').update(actualSession.refreshToken).digest('hex');
    expect(storedRecord.tokenHash).toBe(expectedHash);
    expect(JSON.stringify(storedRecord)).not.toContain(actualSession.refreshToken);
  });

  it('hands the successor to the repository and returns it to the caller', async () => {
    const actualSession = await service.refresh('any-opaque-token', TEST_ORIGIN);

    const [consumeInput] = (authRepositoryMock.consumeRefreshToken as jest.Mock).mock.calls[0] as [
      { nextToken: { tokenHash: string }; tokenHash: string },
    ];
    expect(consumeInput.nextToken.tokenHash).toBe(
      createHash('sha256').update(actualSession.refreshToken).digest('hex'),
    );
    expect(consumeInput.tokenHash).toBe(
      createHash('sha256').update('any-opaque-token').digest('hex'),
    );
  });

  it('accepts a grace-window reissue as a successful refresh', async () => {
    (authRepositoryMock.consumeRefreshToken as jest.Mock).mockResolvedValueOnce({
      outcome: 'GRACE_REISSUED',
      userId,
      familyId: 'family-1',
    });

    await expect(service.refresh('any-opaque-token', TEST_ORIGIN)).resolves.toMatchObject({
      tokens: { tokenType: 'Bearer' },
    });
  });

  /**
   * The family is already dead by the time the service sees the verdict — the
   * repository kills it inside the same transaction. What the service owes is
   * the audit row, because a reuse nobody can find later is a reuse nobody
   * acts on.
   */
  it('audits TOKEN_REUSE and refuses when reuse is detected', async () => {
    (authRepositoryMock.consumeRefreshToken as jest.Mock).mockResolvedValueOnce({
      outcome: 'REUSE_DETECTED',
      userId,
      familyId: 'family-1',
    });

    await expect(service.refresh('replayed-token', TEST_ORIGIN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TOKEN_REUSE', resourceId: 'family-1' }),
    );
  });

  it('refuses a token the database has never seen, without touching a family', async () => {
    (authRepositoryMock.findRefreshTokenFamilyByHash as jest.Mock).mockResolvedValueOnce(null);

    await expect(service.refresh('never-issued', TEST_ORIGIN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authRepositoryMock.consumeRefreshToken).not.toHaveBeenCalled();
    expect(authRepositoryMock.revokeRefreshTokenFamily).not.toHaveBeenCalled();
  });

  it('revokes every family when signing out everywhere', async () => {
    (authRepositoryMock.revokeAllUserRefreshTokens as jest.Mock).mockResolvedValue(3);

    await service.revokeAllSessions(userId, TEST_ORIGIN);

    expect(authRepositoryMock.revokeAllUserRefreshTokens).toHaveBeenCalledWith(userId);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SESSION_REVOKED_ALL', metadata: { revokedCount: 3 } }),
    );
  });

  it('revokes the entire token family when logging out', async () => {
    await service.logout('any-opaque-token', TEST_ORIGIN);

    expect(authRepositoryMock.revokeRefreshTokenFamily).toHaveBeenCalledWith('family-1');
  });

  it('reports success on logout with an unknown token, revoking nothing', async () => {
    (authRepositoryMock.findRefreshTokenFamilyByHash as jest.Mock).mockResolvedValueOnce(null);

    await expect(service.logout('never-issued', TEST_ORIGIN)).resolves.toMatchObject({
      success: true,
    });
    expect(authRepositoryMock.revokeRefreshTokenFamily).not.toHaveBeenCalled();
  });
});

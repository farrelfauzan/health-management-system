import { hash } from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { JwtPayload, RefreshTokenPayload } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { JwtSecretsService } from '../../../common/config/jwt-secrets.service';
import { RequestContext } from '../../../common/observability/observability.types';
import { AuthRepository } from '../repository/auth.repository';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const TEST_ORIGIN: RequestContext = { ipAddress: '203.0.113.9', requestId: 'req-auth-spec' };
  const userId = '41f5da47-4151-4871-a391-106e7da1c02c';
  const authRepositoryMock = {
    findUserByEmail: jest.fn(),
    findUserById: jest.fn(),
    createRefreshToken: jest.fn(),
    rotateRefreshToken: jest.fn(),
    revokeRefreshTokenFamily: jest.fn(),
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
  const service = new AuthService(
    authRepositoryMock,
    jwtService,
    configService,
    auditServiceMock,
    jwtSecretsService,
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
    user.passwordHash = await hash('password123', 4);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (authRepositoryMock.findUserByEmail as jest.Mock).mockResolvedValue(user);
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(user);
    (authRepositoryMock.rotateRefreshToken as jest.Mock).mockResolvedValue(true);
  });

  it('carries the granted permissions on the access token, de-duplicated', async () => {
    const actualTokens = await service.login({
      email: user.email,
      password: 'password123',
    }, TEST_ORIGIN);
    const accessPayload = await jwtService.verifyAsync<JwtPayload>(actualTokens.accessToken, {
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
    const accessPayload = await jwtService.verifyAsync<JwtPayload>(actualTokens.accessToken, {
      secret: 'test-access-secret',
    });

    expect(accessPayload.permissions).not.toContain('dispense.write:any');
  });

  it('keeps permissions out of the refresh token, which re-reads them instead', async () => {
    const actualTokens = await service.login({
      email: user.email,
      password: 'password123',
    }, TEST_ORIGIN);
    const refreshPayload = await jwtService.verifyAsync<Record<string, unknown>>(
      actualTokens.refreshToken,
      { secret: 'test-refresh-secret' },
    );

    expect(refreshPayload).not.toHaveProperty('permissions');
    expect(refreshPayload.roles).toEqual(['ADMIN', 'DOCTOR']);
  });

  it('re-reads permissions from the database when refreshing', async () => {
    const loginTokens = await service.login({
      email: user.email,
      password: 'password123',
    }, TEST_ORIGIN);
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue({
      ...user,
      roles: [
        {
          unassignedAt: null,
          role: {
            code: 'DOCTOR',
            permissions: [{ permission: { permissionKey: 'encounter.read:own' } }],
          },
        },
      ],
    });

    const refreshedTokens = await service.refresh(loginTokens.refreshToken, TEST_ORIGIN);
    const accessPayload = await jwtService.verifyAsync<JwtPayload>(refreshedTokens.accessToken, {
      secret: 'test-access-secret',
    });

    // A grant revoked since login is gone on the next access token, rather
    // than surviving in a copy carried by the refresh token.
    expect(accessPayload.permissions).toEqual(['encounter.read:own']);
  });

  it('persists a hashed refresh token when logging in', async () => {
    const actualTokens = await service.login({
      email: user.email,
      password: 'password123',
    }, TEST_ORIGIN);
    const refreshPayload = await jwtService.verifyAsync<RefreshTokenPayload>(
      actualTokens.refreshToken,
      {
        secret: 'test-refresh-secret',
      },
    );
    expect(actualTokens.accessToken).toEqual(expect.any(String));
    expect(refreshPayload.tokenType).toBe('refresh');
    expect(refreshPayload.familyId).toEqual(expect.any(String));
    expect(authRepositoryMock.createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        id: refreshPayload.jti,
        userId,
        familyId: refreshPayload.familyId,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('rotates both tokens and invalidates the presented refresh token', async () => {
    const loginTokens = await service.login({
      email: user.email,
      password: 'password123',
    }, TEST_ORIGIN);
    const loginPayload = await jwtService.verifyAsync<RefreshTokenPayload>(
      loginTokens.refreshToken,
      {
        secret: 'test-refresh-secret',
      },
    );
    const actualTokens = await service.refresh(loginTokens.refreshToken, TEST_ORIGIN);
    const refreshPayload = await jwtService.verifyAsync<RefreshTokenPayload>(
      actualTokens.refreshToken,
      {
        secret: 'test-refresh-secret',
      },
    );
    expect(actualTokens.refreshToken).not.toBe(loginTokens.refreshToken);
    expect(refreshPayload.familyId).toBe(loginPayload.familyId);
    expect(authRepositoryMock.rotateRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        currentTokenId: loginPayload.jti,
        familyId: loginPayload.familyId,
        currentTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        nextToken: expect.objectContaining({
          id: refreshPayload.jti,
          familyId: loginPayload.familyId,
        }),
      }),
    );
  });

  it('rejects a refresh token when atomic rotation fails', async () => {
    const loginTokens = await service.login({
      email: user.email,
      password: 'password123',
    }, TEST_ORIGIN);
    (authRepositoryMock.rotateRefreshToken as jest.Mock).mockResolvedValue(false);
    await expect(service.refresh(loginTokens.refreshToken, TEST_ORIGIN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes the entire token family when logging out', async () => {
    const loginTokens = await service.login({
      email: user.email,
      password: 'password123',
    }, TEST_ORIGIN);
    const refreshPayload = await jwtService.verifyAsync<RefreshTokenPayload>(
      loginTokens.refreshToken,
      {
        secret: 'test-refresh-secret',
      },
    );
    await service.logout(loginTokens.refreshToken, TEST_ORIGIN);
    expect(authRepositoryMock.revokeRefreshTokenFamily).toHaveBeenCalledWith(
      refreshPayload.familyId,
    );
  });
});

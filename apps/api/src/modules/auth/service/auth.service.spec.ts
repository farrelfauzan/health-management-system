import { hash } from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { RefreshTokenPayload } from '@hms/shared-types';

import { AuthRepository } from '../repository/auth.repository';
import { AuthService } from './auth.service';

describe('AuthService', () => {
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
  const service = new AuthService(authRepositoryMock, jwtService, configService);
  const user = {
    id: userId,
    email: 'admin@hms.local',
    passwordHash: '',
    roles: [
      {
        unassignedAt: null,
        role: {
          code: 'ADMIN',
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

  it('persists a hashed refresh token when logging in', async () => {
    const actualTokens = await service.login({
      email: user.email,
      password: 'password123',
    });
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
    });
    const loginPayload = await jwtService.verifyAsync<RefreshTokenPayload>(
      loginTokens.refreshToken,
      {
        secret: 'test-refresh-secret',
      },
    );
    const actualTokens = await service.refresh(loginTokens.refreshToken);
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
    });
    (authRepositoryMock.rotateRefreshToken as jest.Mock).mockResolvedValue(false);
    await expect(service.refresh(loginTokens.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes the entire token family when logging out', async () => {
    const loginTokens = await service.login({
      email: user.email,
      password: 'password123',
    });
    const refreshPayload = await jwtService.verifyAsync<RefreshTokenPayload>(
      loginTokens.refreshToken,
      {
        secret: 'test-refresh-secret',
      },
    );
    await service.logout(loginTokens.refreshToken);
    expect(authRepositoryMock.revokeRefreshTokenFamily).toHaveBeenCalledWith(
      refreshPayload.familyId,
    );
  });
});

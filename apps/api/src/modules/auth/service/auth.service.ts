import { createHash, randomUUID } from 'node:crypto';
import { compare } from 'bcryptjs';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import {
  AuthTokens,
  IssuedRefreshToken,
  IssueRefreshTokenInput,
  JwtPayload,
  LogoutResult,
  RefreshedAuthTokens,
  RefreshTokenPayload,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { resolveJwtExpiresIn } from '../../../common/auth/jwt-expires.util';
import { RequestContext } from '../../../common/observability/observability.types';
import { AuditAction } from '../../../generated/prisma/client';
import { LoginDto } from '../dto/login.dto';
import { AuthRepository } from '../repository/auth.repository';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async login(payload: LoginDto, origin: RequestContext): Promise<AuthTokens> {
    const user = await this.authRepository.findUserByEmail(payload.email);
    if (!user) {
      await this.recordFailedLogin(origin);
      throw new UnauthorizedException('Invalid credentials');
    }
    // Reserved service accounts (the BPJS Antrean bridge, P14-T04) are actors
    // for machine-originated writes, never identities. Refusing here — before
    // the password is even compared — means no credential an admin could set
    // on that row, deliberately or by accident, ever becomes a session.
    if (user.isSystem) {
      await this.recordFailedLogin(origin, user.id);
      throw new UnauthorizedException('Invalid credentials');
    }
    const isValidPassword = await compare(payload.password, user.passwordHash);
    if (!isValidPassword) {
      await this.recordFailedLogin(origin, user.id);
      throw new UnauthorizedException('Invalid credentials');
    }
    const claims: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: this.resolveActiveRoleCodes(user.roles),
      permissions: this.resolveActivePermissionCodes(user.roles),
    };
    const accessToken = await this.issueAccessToken(claims);
    const issuedRefreshToken = await this.issueRefreshToken({
      claims,
      familyId: randomUUID(),
    });
    await this.authRepository.createRefreshToken(issuedRefreshToken.record);
    await this.auditService.record({
      action: AuditAction.USER_LOGIN,
      resource: 'auth',
      actorUserId: user.id,
      resourceId: user.id,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
    });
    return {
      accessToken,
      refreshToken: issuedRefreshToken.token,
      tokenType: 'Bearer',
      expiresIn: this.resolveAccessTokenExpiresIn(),
    };
  }

  async refresh(refreshToken: string, origin: RequestContext): Promise<RefreshedAuthTokens> {
    const decoded = await this.verifyRefreshToken(refreshToken);
    const user = await this.authRepository.findUserById(decoded.sub);
    if (!user) {
      await this.authRepository.revokeRefreshTokenFamily(decoded.familyId);
      throw new UnauthorizedException('Invalid refresh token');
    }
    const claims: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: this.resolveActiveRoleCodes(user.roles),
      permissions: this.resolveActivePermissionCodes(user.roles),
    };
    const issuedRefreshToken = await this.issueRefreshToken({
      claims,
      familyId: decoded.familyId,
    });
    const isRotated = await this.authRepository.rotateRefreshToken({
      currentTokenId: decoded.jti,
      currentTokenHash: this.hashRefreshToken(refreshToken),
      familyId: decoded.familyId,
      nextToken: issuedRefreshToken.record,
    });
    if (!isRotated) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const accessToken = await this.issueAccessToken(claims);
    await this.auditService.record({
      action: AuditAction.TOKEN_REFRESHED,
      resource: 'auth',
      actorUserId: user.id,
      resourceId: user.id,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
    });
    return {
      accessToken,
      refreshToken: issuedRefreshToken.token,
      tokenType: 'Bearer',
      expiresIn: this.resolveAccessTokenExpiresIn(),
    };
  }

  async logout(refreshToken: string, origin: RequestContext): Promise<LogoutResult> {
    const decoded = await this.verifyRefreshToken(refreshToken);
    await this.authRepository.revokeRefreshTokenFamily(decoded.familyId);
    await this.auditService.record({
      action: AuditAction.USER_LOGOUT,
      resource: 'auth',
      actorUserId: decoded.sub,
      resourceId: decoded.sub,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
    });
    return {
      success: true,
      message: 'Logged out',
    };
  }

  /**
   * Records the attempt without the email. The address is the point: SJ-4 asks
   * for failed logins with an IP so ten in an hour against one account is a
   * detectable pattern (the threshold SJ-24 alerts on). The account itself is
   * identified by `resourceId` when it exists, and by nothing at all when the
   * email matched no user — writing an unmatched email here would turn the
   * audit log into a list of addresses people mistyped.
   */
  private async recordFailedLogin(origin: RequestContext, userId?: string): Promise<void> {
    await this.auditService.record({
      action: AuditAction.USER_LOGIN_FAILED,
      resource: 'auth',
      resourceId: userId ?? null,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
    });
  }

  private resolveActiveRoleCodes(
    userRoles: Array<{ unassignedAt: Date | null; role: { code: string } }>,
  ): string[] {
    return userRoles
      .filter((userRole) => userRole.unassignedAt === null)
      .map((userRole) => userRole.role.code);
  }

  /**
   * Permission codes from every still-assigned role, de-duplicated because two
   * roles commonly grant the same permission and the claim is read as a set.
   */
  private resolveActivePermissionCodes(
    userRoles: Array<{
      unassignedAt: Date | null;
      role: { permissions: Array<{ permission: { permissionKey: string } }> };
    }>,
  ): string[] {
    const permissionKeys = userRoles
      .filter((userRole) => userRole.unassignedAt === null)
      .flatMap((userRole) =>
        userRole.role.permissions.map((entry) => entry.permission.permissionKey),
      );

    return [...new Set(permissionKeys)].sort();
  }

  private async issueAccessToken(claims: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(claims, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
      expiresIn: resolveJwtExpiresIn(
        this.configService.get<string>('JWT_ACCESS_EXPIRES_IN'),
        '15m',
      ),
    });
  }

  private async issueRefreshToken(input: IssueRefreshTokenInput): Promise<IssuedRefreshToken> {
    const tokenId = randomUUID();
    // Permissions are dropped here on purpose: refresh re-reads them from the
    // database, so carrying a copy would only bloat the token and go stale.
    const refreshClaims: Omit<JwtPayload, 'permissions'> = {
      sub: input.claims.sub,
      email: input.claims.email,
      roles: input.claims.roles,
    };
    const token = await this.jwtService.signAsync(
      {
        ...refreshClaims,
        familyId: input.familyId,
        tokenType: 'refresh',
      },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
        expiresIn: resolveJwtExpiresIn(
          this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
          '7d',
        ),
        jwtid: tokenId,
      },
    );
    const payload = await this.verifyRefreshToken(token);
    return {
      token,
      record: {
        id: tokenId,
        userId: input.claims.sub,
        familyId: input.familyId,
        tokenHash: this.hashRefreshToken(token),
        expiresAt: new Date(payload.exp * 1000),
      },
    };
  }

  private async verifyRefreshToken(refreshToken: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
      });
      if (
        payload.tokenType !== 'refresh' ||
        !payload.jti ||
        !payload.familyId ||
        !payload.sub ||
        !payload.exp
      ) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private resolveAccessTokenExpiresIn(): string {
    return this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
  }
}

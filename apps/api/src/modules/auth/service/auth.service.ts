import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { compare } from 'bcryptjs';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import {
  IssuedRefreshToken,
  IssueRefreshTokenInput,
  JwtPayload,
  IssuedSession,
  LogoutResult,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { JwtSecretsService } from '../../../common/config/jwt-secrets.service';
import { JwtExpiresIn, resolveJwtExpiresIn } from '../../../common/auth/jwt-expires.util';
import { RequestContext } from '../../../common/observability/observability.types';
import { AuditAction } from '../../../generated/prisma/client';
import { LoginDto } from '../dto/login.dto';
import { AuthRepository } from '../repository/auth.repository';

/** 256 bits, per SJ-6. */
const REFRESH_TOKEN_BYTES = 32;

/**
 * How long a just-consumed token stays acceptable. Two tabs waking from the
 * same expired access token refresh within milliseconds of each other; ten
 * seconds covers that without leaving a stolen token a meaningful window.
 */
const REFRESH_GRACE_WINDOW_MS = 10_000;

const DURATION_UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  y: 31_536_000_000,
};

/**
 * Reads the forms `JWT_REFRESH_EXPIRES_IN` already accepts — `7d`, `15m`, or a
 * bare number of seconds — into an absolute expiry. The opaque token has no
 * `exp` claim to read back, so the lifetime has to be computed here.
 */
function parseDurationToMs(duration: JwtExpiresIn): number {
  if (typeof duration === 'number') {
    return duration * DURATION_UNIT_MS.s!;
  }
  const match = /^(\d+)(ms|[smhdwy])$/.exec(duration.trim());
  const amount = match?.[1];
  const unit = match?.[2];
  if (!amount || !unit || DURATION_UNIT_MS[unit] === undefined) {
    throw new Error(`Unsupported refresh token lifetime: ${duration}`);
  }
  return Number(amount) * DURATION_UNIT_MS[unit];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly jwtSecrets: JwtSecretsService,
  ) {}

  async login(payload: LoginDto, origin: RequestContext): Promise<IssuedSession> {
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
    const issuedRefreshToken = this.issueRefreshToken({
      userId: user.id,
      familyId: randomUUID(),
      ipAddress: origin.ipAddress,
      userAgent: origin.userAgent,
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
      tokens: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: this.resolveAccessTokenExpiresIn(),
      },
      refreshToken: issuedRefreshToken.token,
      refreshTokenMaxAgeMs: issuedRefreshToken.record.expiresAt.getTime() - Date.now(),
      roles: claims.roles,
      sessionExpiresAt: issuedRefreshToken.record.expiresAt,
    };
  }

  /**
   * Exchanges a refresh token for a new pair (SJ-6).
   *
   * The token is opaque, so there is nothing to decode — the hash is looked up
   * and the database decides. A reuse verdict revokes the family and is
   * audited as `TOKEN_REUSE`; every refusal returns the same message, because
   * telling a caller *why* their token failed tells an attacker whether the
   * string they hold was ever real.
   */
  async refresh(refreshToken: string, origin: RequestContext): Promise<IssuedSession> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const family = await this.authRepository.findRefreshTokenFamilyByHash(tokenHash);
    if (!family) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const nextToken = this.issueRefreshToken({
      userId: family.userId,
      familyId: family.familyId,
      ipAddress: origin.ipAddress,
      userAgent: origin.userAgent,
    });
    const result = await this.authRepository.consumeRefreshToken({
      tokenHash,
      graceWindowMs: REFRESH_GRACE_WINDOW_MS,
      nextToken: nextToken.record,
    });
    if (result.outcome === 'REUSE_DETECTED') {
      await this.auditService.record({
        action: AuditAction.TOKEN_REUSE,
        resource: 'auth',
        actorUserId: result.userId ?? null,
        resourceId: result.familyId ?? null,
        ipAddress: origin.ipAddress,
        requestId: origin.requestId,
      });
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (result.outcome !== 'ROTATED' && result.outcome !== 'GRACE_REISSUED') {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.authRepository.findUserById(result.userId ?? '');
    if (!user) {
      await this.authRepository.revokeRefreshTokenFamily(family.familyId);
      throw new UnauthorizedException('Invalid refresh token');
    }
    const claims: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: this.resolveActiveRoleCodes(user.roles),
      permissions: this.resolveActivePermissionCodes(user.roles),
    };
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
      tokens: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: this.resolveAccessTokenExpiresIn(),
      },
      refreshToken: nextToken.token,
      refreshTokenMaxAgeMs: nextToken.record.expiresAt.getTime() - Date.now(),
      roles: claims.roles,
      sessionExpiresAt: nextToken.record.expiresAt,
    };
  }

  /**
   * Revokes every family the user holds — sign-out-everywhere, and the hook a
   * password change should call once SJ-7 adds one.
   */
  async revokeAllSessions(userId: string, origin: RequestContext): Promise<LogoutResult> {
    const revokedCount = await this.authRepository.revokeAllUserRefreshTokens(userId);
    await this.auditService.record({
      action: AuditAction.SESSION_REVOKED_ALL,
      resource: 'auth',
      actorUserId: userId,
      resourceId: userId,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
      metadata: { revokedCount },
    });
    return { success: true, message: 'All sessions revoked' };
  }

  async logout(refreshToken: string, origin: RequestContext): Promise<LogoutResult> {
    const family = await this.authRepository.findRefreshTokenFamilyByHash(
      this.hashRefreshToken(refreshToken),
    );
    // A logout with an unknown token still succeeds. The client is discarding
    // its session either way, and answering "that token was not real" would
    // turn this endpoint into an oracle for probing stolen strings.
    if (!family) {
      return { success: true, message: 'Logged out' };
    }
    await this.authRepository.revokeRefreshTokenFamily(family.familyId);
    await this.auditService.record({
      action: AuditAction.USER_LOGOUT,
      resource: 'auth',
      resourceId: family.familyId,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
    });
    return { success: true, message: 'Logged out' };
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
      secret: this.jwtSecrets.getAccessSigningSecret(),
      expiresIn: resolveJwtExpiresIn(
        this.configService.get<string>('JWT_ACCESS_EXPIRES_IN'),
        '15m',
      ),
    });
  }

  /**
   * Mints an opaque refresh token (SJ-6): 256 bits from the CSPRNG, base64url
   * so it survives a cookie unescaped. It carries no claims — a JWT refresh
   * token published the holder's identity, email and roles to anyone who could
   * read the cookie, and bought nothing, because the database was already the
   * authority on whether a token was live.
   *
   * Only the SHA-256 is persisted. Plain SHA-256 rather than a password hash
   * is right here and would be wrong for a password: the input is 256 bits of
   * uniform randomness, so there is no dictionary to slow down, and the lookup
   * is on the hot refresh path.
   */
  private issueRefreshToken(input: IssueRefreshTokenInput): IssuedRefreshToken {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    return {
      token,
      record: {
        id: randomUUID(),
        userId: input.userId,
        familyId: input.familyId,
        tokenHash: this.hashRefreshToken(token),
        expiresAt: this.resolveRefreshTokenExpiry(),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    };
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private resolveRefreshTokenExpiry(): Date {
    const lifetime = resolveJwtExpiresIn(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
      '7d',
    );
    return new Date(Date.now() + parseDurationToMs(lifetime));
  }

  private resolveAccessTokenExpiresIn(): string {
    return this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
  }
}

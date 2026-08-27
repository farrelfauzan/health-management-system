import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import {
  IssuedRefreshToken,
  IssueRefreshTokenInput,
  JwtPayload,
  IssuedSession,
  LoginOutcome,
  LogoutResult,
  MfaRequirement,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { PasswordHasherService } from '../../../common/crypto/password-hasher.service';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { JwtSecretsService } from '../../../common/config/jwt-secrets.service';
import { JwtExpiresIn, resolveJwtExpiresIn } from '../../../common/auth/jwt-expires.util';
import { PORTAL_PERMISSION_PREFIX } from '../portal-permission-prefix';
import { RequestContext } from '../../../common/observability/observability.types';
import { AuditAction } from '../../../generated/prisma/client';
import { LoginDto } from '../dto/login.dto';
import { AuthRepository } from '../repository/auth.repository';
import { MfaRepository } from '../repository/mfa.repository';
import { LoginThrottleService } from './login-throttle.service';
import { MfaEnforcementService } from './mfa-enforcement.service';
import { SessionPolicyService } from './session-policy.service';
import { MfaTicketService } from './mfa-ticket.service';

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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly jwtSecrets: JwtSecretsService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly loginThrottle: LoginThrottleService,
    private readonly mfaRepository: MfaRepository,
    private readonly mfaEnforcement: MfaEnforcementService,
    private readonly mfaTickets: MfaTicketService,
    private readonly sessionPolicy: SessionPolicyService,
  ) {}

  /**
   * Authenticates, or refuses in a way that reveals nothing (SJ-7).
   *
   * Every failure path below costs roughly the same wall-clock time and
   * returns byte-identical output. An unknown address still runs an Argon2
   * verification against a throwaway hash; a system account is refused after
   * the same work as a wrong password. The throttle is keyed on the submitted
   * address rather than a resolved user, so a nonexistent account backs off
   * exactly like a real one — otherwise the throttle itself would answer the
   * question the rest of this is hiding.
   *
   * Since SJ-8 a correct password is not always the end of it: a privileged
   * account receives a two-minute ticket instead of a session and has to spend
   * it on the challenge endpoint. That branch sits *after* every
   * timing-equalised failure path on purpose — it is reached only once the
   * password is known good, so it can never become a way to ask whether an
   * account exists or which accounts are privileged.
   */
  async login(payload: LoginDto, origin: RequestContext): Promise<LoginOutcome> {
    const identifierHash = this.loginThrottle.hashIdentifier(payload.email);
    await this.loginThrottle.assertWithinLimits({ identifierHash, ipAddress: origin.ipAddress });
    const user = await this.authRepository.findUserByEmail(payload.email);
    if (!user) {
      await this.passwordHasher.verifyAgainstDummy(payload.password);
      throw await this.buildLoginFailure({ identifierHash, origin });
    }
    // Reserved service accounts (the BPJS Antrean bridge, P14-T04) are actors
    // for machine-originated writes, never identities. Refusing here — after
    // the same hashing work as any other failure — means no credential an
    // admin could set on that row ever becomes a session, and that the refusal
    // is not detectable as a different kind of "no".
    if (user.isSystem) {
      await this.passwordHasher.verifyAgainstDummy(payload.password);
      throw await this.buildLoginFailure({ identifierHash, origin, userId: user.id });
    }
    const isValidPassword = await this.passwordHasher.verifyPassword(
      user.passwordHash,
      payload.password,
    );
    if (!isValidPassword) {
      throw await this.buildLoginFailure({ identifierHash, origin, userId: user.id });
    }
    await this.upgradePasswordHashIfStale(user.id, user.passwordHash, payload.password);
    await this.loginThrottle.recordAttempt({
      identifierHash,
      ipAddress: origin.ipAddress,
      succeeded: true,
    });
    const claims: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: this.resolveActiveRoleCodes(user.roles),
      permissions: this.resolveActivePermissionCodes(user.roles),
    };
    const requirement = this.mfaEnforcement.evaluate(claims.permissions);
    const secondFactorTicket = await this.resolveSecondFactorTicket(user.id, requirement);
    if (secondFactorTicket) {
      return secondFactorTicket;
    }
    return {
      kind: 'SESSION',
      session: await this.issueSession(claims, origin, AuditAction.USER_LOGIN),
      enrolmentRequired: requirement.isPrivileged && this.mfaEnforcement.isEnforceable,
      enrolmentDeadline: requirement.graceUntil,
    };
  }

  /**
   * The token-issuance backstop (SJ-8), or null when the caller may proceed.
   *
   * This is the only place that decides a password was not enough, and it is
   * placed at issuance rather than on individual routes because that is the
   * one chokepoint every session must pass. A guard on business endpoints
   * would have to be remembered on each new route; a check here cannot be
   * forgotten, because forgetting it means not issuing a token at all.
   */
  private async resolveSecondFactorTicket(
    userId: string,
    requirement: MfaRequirement,
  ): Promise<LoginOutcome | null> {
    const verifiedAt = await this.mfaRepository.findVerifiedAt(userId);
    if (verifiedAt) {
      return {
        kind: 'MFA_TICKET',
        status: 'MFA_REQUIRED',
        ticket: await this.mfaTickets.issueTicket(userId, 'mfa_challenge'),
        expiresIn: `${this.mfaTickets.ticketLifetimeSeconds}s`,
      };
    }
    // No factor enrolled. Only a privileged account is stopped, only once the
    // grace period is over, and never on a deployment that has no encryption
    // key — without one, enrolment is impossible and refusing here would lock
    // every administrator out with no way back in.
    if (!requirement.isPrivileged || requirement.isWithinGrace || !this.mfaEnforcement.isEnforceable) {
      return null;
    }
    return {
      kind: 'MFA_TICKET',
      status: 'MFA_ENROLMENT_REQUIRED',
      ticket: await this.mfaTickets.issueTicket(userId, 'mfa_enrolment'),
      expiresIn: `${this.mfaTickets.ticketLifetimeSeconds}s`,
    };
  }

  /**
   * Issues a session for a user who has satisfied every factor. The single
   * place a refresh-token family is born, called from login, from a completed
   * MFA challenge, and from a completed forced enrolment.
   */
  async issueSessionForVerifiedUser(userId: string, origin: RequestContext): Promise<IssuedSession> {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueSession(
      {
        sub: user.id,
        email: user.email,
        roles: this.resolveActiveRoleCodes(user.roles),
        permissions: this.resolveActivePermissionCodes(user.roles),
      },
      origin,
      AuditAction.USER_LOGIN,
    );
  }

  private async issueSession(
    claims: JwtPayload,
    origin: RequestContext,
    auditAction: AuditAction,
  ): Promise<IssuedSession> {
    const accessToken = await this.issueAccessToken(claims);
    const issuedRefreshToken = this.issueRefreshToken({
      userId: claims.sub,
      familyId: randomUUID(),
      ipAddress: origin.ipAddress,
      userAgent: origin.userAgent,
    });
    await this.authRepository.createRefreshToken(issuedRefreshToken.record);
    await this.auditService.record({
      action: auditAction,
      resource: 'auth',
      actorUserId: claims.sub,
      resourceId: claims.sub,
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
      permissions: claims.permissions,
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
      idleTimeoutMs: this.sessionPolicy.idleTimeoutMs,
      nextToken: nextToken.record,
    });
    // SJ-9 — the session was abandoned. Audited as its own verb rather than
    // folded into a generic refusal: "a terminal sat unattended with a session
    // open" is a workflow finding a clinic can act on, and it is invisible if
    // it looks like every other failed refresh.
    if (result.outcome === 'IDLE_TIMEOUT') {
      await this.auditService.record({
        action: AuditAction.SESSION_TIMEOUT,
        resource: 'auth',
        actorUserId: result.userId ?? null,
        resourceId: result.familyId ?? null,
        ipAddress: origin.ipAddress,
        requestId: origin.requestId,
        metadata: { idleTimeoutMinutes: this.sessionPolicy.idleTimeoutMinutes },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }
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
    await this.assertSecondFactorSatisfied(user.id, claims.permissions);
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
      permissions: claims.permissions,
      sessionExpiresAt: nextToken.record.expiresAt,
    };
  }

  /**
   * Reports that a session is still in use, without rotating it (SJ-9).
   *
   * The browser cannot be trusted to decide when a session is alive — that is
   * why the timeout is enforced server-side at all. What the browser *can*
   * legitimately report is that a human is interacting with it, and this is
   * the narrowest possible channel for saying so: it extends a session that is
   * still inside its window and cannot resurrect one that is not.
   *
   * Without it, someone reading a long patient record — present, scrolling,
   * making no API calls — is indistinguishable from someone who walked away,
   * and gets logged out mid-sentence.
   *
   * Never throws. A heartbeat is advisory; the caller's next real request will
   * discover the session is gone through the ordinary refresh path, and
   * failing loudly here would only add an error nobody can act on.
   */
  async recordSessionActivity(refreshToken: string): Promise<boolean> {
    const touched = await this.authRepository.touchRefreshToken({
      tokenHash: this.hashRefreshToken(refreshToken),
      idleTimeoutMs: this.sessionPolicy.idleTimeoutMs,
    });
    return touched !== null;
  }

  /** The threshold the client counts down to, so the two never disagree. */
  get idleTimeoutSeconds(): number {
    return Math.round(this.sessionPolicy.idleTimeoutMs / 1_000);
  }

  get warningLeadSeconds(): number {
    return this.sessionPolicy.warningLeadSeconds;
  }

  /**
   * Ends a session because the workstation is being handed over (SJ-9).
   *
   * Mechanically identical to `logout` — the family dies either way — and
   * separate only in the audit trail. "Are staff actually locking terminals
   * when they walk away" is a question a clinic will eventually ask, and it is
   * unanswerable if a deliberate hand-off is recorded the same way as closing
   * a browser tab at the end of a shift.
   */
  async lockSession(refreshToken: string, origin: RequestContext): Promise<LogoutResult> {
    return this.endSession(refreshToken, origin, AuditAction.SESSION_LOCK);
  }

  /**
   * Closes the door on a session that predates the requirement (SJ-8).
   *
   * Refresh is the loophole the login backstop cannot see. Promote a user to
   * an admin role and their existing refresh token would otherwise keep
   * minting access tokens for a week without ever passing a challenge. Killing
   * the family rather than merely refusing sends them back through login,
   * which is the path that hands out an enrolment ticket — a bare 401 would
   * leave a client retrying a token that will never work again.
   */
  private async assertSecondFactorSatisfied(
    userId: string,
    permissionKeys: string[],
  ): Promise<void> {
    if (!this.mfaEnforcement.isEnforceable) {
      return;
    }
    const requirement = this.mfaEnforcement.evaluate(permissionKeys);
    if (!requirement.isPrivileged || requirement.isWithinGrace) {
      return;
    }
    const verifiedAt = await this.mfaRepository.findVerifiedAt(userId);
    if (verifiedAt) {
      return;
    }
    await this.authRepository.revokeAllUserRefreshTokens(userId);
    throw new UnauthorizedException('Invalid refresh token');
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
    return this.endSession(refreshToken, origin, AuditAction.USER_LOGOUT);
  }

  private async endSession(
    refreshToken: string,
    origin: RequestContext,
    auditAction: AuditAction,
  ): Promise<LogoutResult> {
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
      action: auditAction,
      resource: 'auth',
      resourceId: family.familyId,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
    });
    return { success: true, message: 'Logged out' };
  }

  /**
   * Records a rejected login and returns the one refusal every failure path
   * throws, so there is a single error shape to keep honest. Returning it
   * rather than throwing lets the call sites `throw await`, which is what
   * tells the compiler control stops there.
   */
  private async buildLoginFailure(input: {
    identifierHash: string;
    origin: RequestContext;
    userId?: string;
  }): Promise<UnauthorizedException> {
    await this.loginThrottle.recordAttempt({
      identifierHash: input.identifierHash,
      ipAddress: input.origin.ipAddress,
      succeeded: false,
    });
    await this.recordFailedLogin(input.origin, input.userId);
    return new UnauthorizedException('Invalid credentials');
  }

  /**
   * Re-hashes a surviving bcrypt password, or one written under weaker Argon2
   * parameters, using the only moment the plaintext is legitimately in hand
   * (SJ-7). Old hashes die off as their owners log in, with no forced reset.
   *
   * A failure here is swallowed: the credential was already verified, so
   * refusing the login because a housekeeping write failed would turn a
   * successful authentication into an outage. The next login retries.
   */
  private async upgradePasswordHashIfStale(
    userId: string,
    storedHash: string,
    plainPassword: string,
  ): Promise<void> {
    if (!this.passwordHasher.needsRehash(storedHash)) {
      return;
    }
    try {
      const upgradedHash = await this.passwordHasher.hashPassword(plainPassword);
      await this.authRepository.updateUserPasswordHash(userId, upgradedHash);
    } catch {
      this.logger.warn(buildSafeErrorLog('password_hash_upgrade_failed', { userId }));
    }
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

  /**
   * Signs the access token, carrying only the `portal.*` slice of the caller's
   * permissions.
   *
   * The full set used to ride along here and it broke the session it was meant
   * to describe. A SUPER_ADMIN holds 127 keys; as a JSON array in the payload
   * that is a 4212-byte JWT, and `hms_access_token=` plus that value is 4229
   * bytes against a 4096-byte per-cookie browser limit. The write from
   * `setAccessTokenCookie` was silently discarded — no exception, no console
   * warning — so the admin shell fell back to a hardcoded CASL preset on every
   * single render and role management disappeared for the one role that
   * actually held `role.create:any`.
   *
   * Only `portal.*` stays, because `proxy.ts` gates the shell at the edge
   * where no API call is possible and it matches those keys exactly, scope
   * included. Everything else is visibility data with no business inside a
   * credential: `PermissionsGuard` re-reads permissions from the database on
   * every request and has never trusted this claim. The web tier reads the
   * full set from the session hint, which exists precisely to carry rendering
   * hints — see `packPermissionHint`.
   */
  private async issueAccessToken(claims: JwtPayload): Promise<string> {
    const portalClaims: JwtPayload = {
      ...claims,
      permissions: claims.permissions.filter((permissionKey) =>
        permissionKey.startsWith(PORTAL_PERMISSION_PREFIX),
      ),
    };
    return this.jwtService.signAsync(portalClaims, {
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

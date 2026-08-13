import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeCryptoPlugin } from '@otplib/plugin-crypto-node';
import { TOTP } from '@otplib/totp';

import {
  MfaChallengeFailure,
  MfaChallengeInput,
  MfaEnrolment,
  MfaRecoveryCodes,
  MfaResetInput,
  MfaStatus,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { MfaActor } from '../../../common/auth/mfa-actor.type';
import { RequestContext } from '../../../common/observability/observability.types';
import { AuditAction } from '../../../generated/prisma/client';
import { AuthRepository } from '../repository/auth.repository';
import { MfaRepository } from '../repository/mfa.repository';
import { LoginThrottleService } from './login-throttle.service';
import { MfaEnforcementService } from './mfa-enforcement.service';
import { createRecoveryCode } from './recovery-code.factory';
import { createTotpBase32Plugin } from './totp-base32.plugin';

/**
 * ±30 seconds, i.e. one time step either side of now. Enough for a phone whose
 * clock has drifted or a user who starts typing as a code expires; small
 * enough that an observed code is dead within a minute.
 */
const DRIFT_TOLERANCE_SECONDS = 30;

/** RFC 6238 default, and what every authenticator app assumes. */
const TIME_STEP_SECONDS = 30;

const RECOVERY_CODE_COUNT = 10;

/** Namespaces the recovery-code hash so one precomputation cannot span users. */
const RECOVERY_HASH_PREFIX = 'mfa-recovery';

/**
 * TOTP enrolment, verification and recovery (SJ-8).
 *
 * The service never decides *whether* a second factor is required — that is
 * {@link MfaEnforcementService}, consulted from the token-issuance path. This
 * class only answers "is this person holding the factor they claim to hold",
 * and the answer is deliberately expensive to fake and cheap to audit.
 */
@Injectable()
export class MfaService {
  private readonly issuer: string;

  /**
   * The class API from `@otplib/totp` rather than the umbrella package's
   * `verify()` helper, for two reasons. Only the class's result type carries
   * `timeStep` — the loose export widens to a union with HOTP, whose result
   * has none, and the replay guard is built on exactly that field. And the
   * umbrella package drags in ESM-only defaults that jest cannot load, which
   * would put every spec touching `AppModule` behind a transform workaround.
   *
   * Every RFC 6238 parameter is stated rather than inherited. SHA-1, six
   * digits and thirty seconds are what authenticator apps assume; a future
   * library default drifting away from them would silently invalidate every
   * enrolment in the clinic, and there is no migration for that.
   */
  private readonly totp = new TOTP({
    algorithm: 'sha1',
    digits: 6,
    period: TIME_STEP_SECONDS,
    crypto: new NodeCryptoPlugin(),
    base32: createTotpBase32Plugin(),
  });

  constructor(
    private readonly mfaRepository: MfaRepository,
    private readonly authRepository: AuthRepository,
    private readonly enforcement: MfaEnforcementService,
    private readonly loginThrottle: LoginThrottleService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.issuer = configService.get<string>('MFA_ISSUER_NAME') ?? 'HMS Clinic';
  }

  /**
   * Starts enrolment: a fresh secret, stored sealed and unverified.
   *
   * Unverified is the important half. The row exists so the next call has
   * something to check against, but until the user returns a live code it
   * changes nothing — login is unaffected and no lockout is possible. Calling
   * this twice before verifying simply discards the first secret, which is
   * what a user who closed the tab and started again expects.
   *
   * Calling it against an *already verified* credential is refused, and that
   * refusal is load-bearing rather than tidiness. Overwriting clears
   * `verifiedAt`, so without this check anyone holding a stolen access token
   * could strip the victim's second factor by starting an enrolment they never
   * finish — turning the endpoint that exists to add a factor into the one
   * that removes it. Replacing a live factor goes through
   * {@link resetForUser}, which demands a current code.
   */
  async beginEnrolment(actor: MfaActor): Promise<MfaEnrolment> {
    this.assertEnrolmentAvailable();
    const user = await this.authRepository.findUserById(actor.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (await this.mfaRepository.findVerifiedAt(actor.userId)) {
      throw new ConflictException('A second factor is already enrolled for this account');
    }
    const secret = this.totp.generateSecret();
    await this.mfaRepository.upsertCredential({ userId: user.id, secret });
    return {
      otpauthUri: this.totp.toURI({ issuer: this.issuer, label: user.email, secret }),
      secret,
    };
  }

  /**
   * Completes enrolment by proving possession, then issues recovery codes.
   *
   * The accepted time step is written with `verifiedAt` in the same statement,
   * so the code that switched enforcement on is already spent and cannot be
   * turned around against the challenge endpoint seconds later.
   */
  async completeEnrolment(
    actor: MfaActor,
    code: string,
    origin: RequestContext,
  ): Promise<MfaRecoveryCodes> {
    this.assertEnrolmentAvailable();
    await this.loginThrottle.assertAccountWithinLimits(this.throttleKey(actor.userId));
    const credential = await this.mfaRepository.findCredentialSnapshot(actor.userId);
    if (!credential) {
      throw new BadRequestException('Start enrolment before verifying a code');
    }
    if (credential.verifiedAt) {
      throw new ConflictException('A second factor is already enrolled for this account');
    }
    const result = await this.totp.verify(stripWhitespace(code), {
      secret: credential.secret,
      epochTolerance: DRIFT_TOLERANCE_SECONDS,
    });
    if (!result.valid) {
      await this.recordChallengeFailure(actor.userId, 'INVALID_CODE', origin);
      throw new UnauthorizedException('That code is not valid');
    }
    await this.mfaRepository.markCredentialVerified(actor.userId, result.timeStep);
    const recoveryCodes = await this.issueRecoveryCodes(actor.userId);
    await this.auditService.record({
      action: AuditAction.MFA_ENROLLED,
      resource: 'auth',
      actorUserId: actor.userId,
      resourceId: actor.userId,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
    });
    return recoveryCodes;
  }

  /**
   * Answers a login challenge with either factor, returning the user id the
   * caller has now fully authenticated as.
   *
   * Returning an id rather than a session keeps token issuance in one place —
   * `AuthService` — so there is exactly one function in the codebase that
   * mints a refresh-token family, and it is the one SJ-6 hardened.
   */
  async answerChallenge(
    userId: string,
    input: MfaChallengeInput,
    origin: RequestContext,
  ): Promise<string> {
    await this.loginThrottle.assertAccountWithinLimits(this.throttleKey(userId));
    const credential = await this.mfaRepository.findCredentialSnapshot(userId);
    if (!credential?.verifiedAt) {
      // No verified factor, yet a challenge ticket was issued for this account.
      // The ticket outlived a reset, or something is wrong; either way there is
      // nothing here to verify against.
      throw new UnauthorizedException('Verification failed');
    }
    if (input.recoveryCode !== undefined) {
      return this.consumeRecoveryCode(userId, input.recoveryCode, origin);
    }
    return this.acceptTotpCode(userId, credential.secret, input.code ?? '', origin);
  }

  /**
   * Re-issues the whole set, invalidating every prior code.
   *
   * Requires a current TOTP code even though the caller already holds an
   * access token: this endpoint mints ten durable bypasses for the second
   * factor, so a borrowed unlocked workstation must not be enough to reach it.
   */
  async regenerateRecoveryCodes(
    userId: string,
    code: string,
    origin: RequestContext,
  ): Promise<MfaRecoveryCodes> {
    await this.loginThrottle.assertAccountWithinLimits(this.throttleKey(userId));
    const credential = await this.mfaRepository.findCredentialSnapshot(userId);
    if (!credential?.verifiedAt) {
      throw new BadRequestException('No second factor is enrolled for this account');
    }
    await this.acceptTotpCode(userId, credential.secret, code, origin);
    const recoveryCodes = await this.issueRecoveryCodes(userId);
    await this.auditService.record({
      action: AuditAction.MFA_RECOVERY_REGENERATED,
      resource: 'auth',
      actorUserId: userId,
      resourceId: userId,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
    });
    return recoveryCodes;
  }

  async getStatus(userId: string): Promise<MfaStatus> {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const requirement = this.enforcement.evaluate(collectPermissionKeys(user));
    const verifiedAt = await this.mfaRepository.findVerifiedAt(userId);
    return {
      enrolled: verifiedAt !== null,
      required: requirement.isPrivileged && this.enforcement.isEnforceable,
      ...(verifiedAt ? { enrolledAt: verifiedAt.toISOString() } : {}),
      unusedRecoveryCodeCount: await this.mfaRepository.countUnusedRecoveryCodes(userId),
      ...(requirement.graceUntil ? { enrolmentDeadline: requirement.graceUntil.toISOString() } : {}),
    };
  }

  /**
   * Removes another user's second factor after a lost device (SJ-8).
   *
   * Three things guard the most abusable action in the feature. The caller
   * needs the admin permission the route declares; they must produce their
   * *own* current TOTP code, so a hijacked admin session cannot spend it; and
   * every use is audited with the stated reason. Revoking the target's
   * sessions is part of the same act — leaving them signed in would mean the
   * reset had not actually taken the factor away from whoever held it.
   *
   * Passing your own id is allowed, and is the supported way to move to a new
   * phone: prove the factor you still hold, have it removed, enrol again. That
   * needs no special case, because the code requirement is already the right
   * one — anyone who cannot produce a code is in the lost-device situation and
   * needs a colleague, which is exactly what this endpoint enforces.
   */
  async resetForUser(
    adminUserId: string,
    input: MfaResetInput,
    origin: RequestContext,
  ): Promise<void> {
    await this.loginThrottle.assertAccountWithinLimits(this.throttleKey(adminUserId));
    const adminCredential = await this.mfaRepository.findCredentialSnapshot(adminUserId);
    if (!adminCredential?.verifiedAt) {
      throw new ForbiddenException(
        'Enrol your own second factor before resetting somebody else’s',
      );
    }
    await this.acceptTotpCode(adminUserId, adminCredential.secret, input.actorCode, origin);
    const target = await this.authRepository.findUserById(input.userId);
    if (!target) {
      throw new BadRequestException('No such user');
    }
    await this.mfaRepository.deleteCredential(target.id);
    await this.mfaRepository.deleteRecoveryCodes(target.id);
    await this.authRepository.revokeAllUserRefreshTokens(target.id);
    await this.auditService.record({
      action: AuditAction.MFA_RESET,
      resource: 'auth',
      actorUserId: adminUserId,
      resourceId: target.id,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
      metadata: { reason: input.reason },
    });
  }

  /**
   * Verifies a TOTP code and burns its time step.
   *
   * Two rejections, reported identically. An invalid code is a wrong guess; a
   * *replayed* one is a code that was right and has already been spent. The
   * caller is told the same thing either way, because "correct, but used" is
   * confirmation that the value guessed was real.
   */
  private async acceptTotpCode(
    userId: string,
    secret: string,
    code: string,
    origin: RequestContext,
  ): Promise<string> {
    const result = await this.totp.verify(stripWhitespace(code), {
      secret,
      epochTolerance: DRIFT_TOLERANCE_SECONDS,
    });
    if (!result.valid) {
      await this.recordChallengeFailure(userId, 'INVALID_CODE', origin);
      throw new UnauthorizedException('Verification failed');
    }
    // The watermark only ever moves forward, and the database decides. Two
    // requests carrying the same code both verify against the same snapshot;
    // exactly one advances the counter, and the other is a replay.
    const advanced = await this.mfaRepository.advanceAcceptedTimeStep(userId, result.timeStep);
    if (!advanced) {
      await this.recordChallengeFailure(userId, 'REPLAYED_CODE', origin);
      throw new UnauthorizedException('Verification failed');
    }
    await this.loginThrottle.recordAttempt({
      identifierHash: this.throttleKey(userId),
      ipAddress: origin.ipAddress,
      succeeded: true,
    });
    return userId;
  }

  private async consumeRecoveryCode(
    userId: string,
    recoveryCode: string,
    origin: RequestContext,
  ): Promise<string> {
    const consumed = await this.mfaRepository.consumeRecoveryCode(
      userId,
      this.hashRecoveryCode(userId, recoveryCode),
    );
    if (!consumed) {
      await this.recordChallengeFailure(userId, 'INVALID_RECOVERY_CODE', origin);
      throw new UnauthorizedException('Verification failed');
    }
    await this.loginThrottle.recordAttempt({
      identifierHash: this.throttleKey(userId),
      ipAddress: origin.ipAddress,
      succeeded: true,
    });
    await this.auditService.record({
      action: AuditAction.MFA_RECOVERY_USED,
      resource: 'auth',
      actorUserId: userId,
      resourceId: userId,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
      metadata: { remainingCodes: await this.mfaRepository.countUnusedRecoveryCodes(userId) },
    });
    return userId;
  }

  private async issueRecoveryCodes(userId: string): Promise<MfaRecoveryCodes> {
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => createRecoveryCode());
    await this.mfaRepository.replaceRecoveryCodes(
      userId,
      recoveryCodes.map((code) => ({ userId, codeHash: this.hashRecoveryCode(userId, code) })),
    );
    return { recoveryCodes };
  }

  private hashRecoveryCode(userId: string, recoveryCode: string): string {
    return createHash('sha256')
      .update(`${RECOVERY_HASH_PREFIX}:${userId}:${stripWhitespace(recoveryCode).toLowerCase()}`)
      .digest('hex');
  }

  /**
   * Namespaced so MFA failures back off on their own curve rather than
   * counting against the account's password-failure streak — and so a locked
   * MFA challenge never reads as a locked password, which would tell an
   * observer which factor is being attacked.
   */
  private throttleKey(userId: string): string {
    return this.loginThrottle.hashIdentifier(`mfa:${userId}`);
  }

  private async recordChallengeFailure(
    userId: string,
    failure: MfaChallengeFailure,
    origin: RequestContext,
  ): Promise<void> {
    await this.loginThrottle.recordAttempt({
      identifierHash: this.throttleKey(userId),
      ipAddress: origin.ipAddress,
      succeeded: false,
    });
    await this.auditService.record({
      action: AuditAction.MFA_CHALLENGE_FAILED,
      resource: 'auth',
      resourceId: userId,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
      metadata: { failure },
    });
  }

  private assertEnrolmentAvailable(): void {
    if (!this.enforcement.isEnforceable) {
      throw new ServiceUnavailableException(
        'Multi-factor authentication is not configured on this deployment',
      );
    }
  }
}

/**
 * Authenticators render codes as `123 456` and printed recovery codes get
 * transcribed with stray spaces. The wire schema tolerates that; verification
 * needs the bare value, and this is the single place the two meet.
 */
function stripWhitespace(value: string): string {
  return value.replace(/\s+/g, '');
}

function collectPermissionKeys(user: {
  roles: Array<{
    unassignedAt: Date | null;
    role: { permissions: Array<{ permission: { permissionKey: string } }> };
  }>;
}): string[] {
  return user.roles
    .filter((userRole) => userRole.unassignedAt === null)
    .flatMap((userRole) => userRole.role.permissions.map((entry) => entry.permission.permissionKey));
}

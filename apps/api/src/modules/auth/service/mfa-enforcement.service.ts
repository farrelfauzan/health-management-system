import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MfaRequirement } from '@hms/shared-types';

import { MfaCryptoService } from '../../../common/crypto/mfa-crypto.service';
import { findPrivilegedPermissions } from './privileged-permission.predicate';

/**
 * Decides whether an account must hold a second factor, and whether it is
 * still inside the grace period (SJ-8).
 *
 * Kept apart from {@link MfaService} because the *decision* is consulted from
 * the token-issuance path — login and refresh — while the *mechanics* are
 * consulted from the MFA routes. Folding them together would make
 * `AuthService` depend on TOTP verification it never performs.
 */
@Injectable()
export class MfaEnforcementService {
  private readonly logger = new Logger(MfaEnforcementService.name);
  private readonly graceUntil: Date | null;

  constructor(
    configService: ConfigService,
    private readonly mfaCrypto: MfaCryptoService,
  ) {
    this.graceUntil = readGraceUntil(configService, this.logger);
    if (!this.mfaCrypto.isConfigured) {
      this.logger.warn(
        'MFA_SECRET_ENCRYPTION_KEY is not set: second-factor enrolment is unavailable and enforcement is disabled. Production refuses to boot in this state.',
      );
    }
  }

  /**
   * Whether enforcement can act at all.
   *
   * Without an encryption key nobody can enrol, so demanding a second factor
   * would lock every privileged account out with no route back in. Production
   * cannot reach this state — `validateEnvironment` refuses to boot without
   * the key — so failing open here only ever affects a developer who has not
   * set one, which is the outcome they want.
   */
  get isEnforceable(): boolean {
    return this.mfaCrypto.isConfigured;
  }

  /**
   * Evaluates the requirement from a resolved permission set.
   *
   * Called on every login and every refresh rather than cached on the user
   * row, so promoting someone starts demanding a second factor on their next
   * request and demoting them stops — no backfill, no stale flag to reconcile.
   */
  evaluate(permissionKeys: readonly string[]): MfaRequirement {
    const matchedPermissions = findPrivilegedPermissions(permissionKeys);
    const isPrivileged = matchedPermissions.length > 0;
    if (!isPrivileged) {
      return {
        isPrivileged: false,
        matchedPermissions: [],
        graceUntil: null,
        isWithinGrace: false,
      };
    }
    const isWithinGrace = this.graceUntil !== null && Date.now() < this.graceUntil.getTime();
    return {
      isPrivileged: true,
      matchedPermissions,
      graceUntil: isWithinGrace ? this.graceUntil : null,
      isWithinGrace,
    };
  }
}

/**
 * Reads `MFA_ENFORCEMENT_GRACE_UNTIL`, an absolute instant.
 *
 * An unparseable value is treated as absent — enforce now — and logged. The
 * alternative, refusing to boot, turns a typo in an optional setting into an
 * outage; the alternative to *that*, silently granting an unbounded grace
 * period, turns it into a security hole nobody sees. Enforcing is the failure
 * that gets noticed and cannot be exploited.
 */
function readGraceUntil(configService: ConfigService, logger: Logger): Date | null {
  const rawValue = configService.get<string>('MFA_ENFORCEMENT_GRACE_UNTIL');
  if (rawValue === undefined || rawValue.trim() === '') {
    return null;
  }
  const parsed = new Date(rawValue.trim());
  if (Number.isNaN(parsed.getTime())) {
    logger.error(
      'MFA_ENFORCEMENT_GRACE_UNTIL is not a valid ISO-8601 instant; enforcing immediately',
    );
    return null;
  }
  return parsed;
}

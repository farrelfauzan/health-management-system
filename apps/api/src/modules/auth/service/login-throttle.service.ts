import { createHash } from 'node:crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { AuthRepository } from '../repository/auth.repository';

/**
 * Failures tolerated before an account starts backing off. Five covers
 * fat-fingering a password and a stale saved credential without making the
 * sixth attempt free.
 */
const FAILURES_BEFORE_BACKOFF = 5;

/** 2^n seconds from the first backed-off failure, capped so a lock always ends. */
const MAX_BACKOFF_MS = 15 * 60 * 1_000;

/**
 * Per-IP ceiling on the login route. Generous for a shared clinic NAT — a
 * front desk behind one address genuinely does log in repeatedly — and still
 * three orders of magnitude below a useful guessing rate.
 */
const IP_ATTEMPT_WINDOW_MS = 60 * 1_000;
const MAX_ATTEMPTS_PER_IP_PER_WINDOW = 10;

/** How far back a failure streak is counted. */
const ACCOUNT_WINDOW_MS = 60 * 60 * 1_000;

/**
 * Online-guessing throttle for the login route (SJ-7).
 *
 * Deliberately a **soft lock**: the delay grows with consecutive failures and
 * expires on its own, and any success clears the streak. A hard lockout would
 * be a denial-of-service handed to anyone who knows a colleague's email
 * address — for a clinic, locking the front desk out of the system during
 * opening hours is a worse outcome than the guessing it prevents.
 *
 * Throttling keys on a hash of the submitted email, **not** on a resolved
 * user. An unknown address accumulates failures and backs off exactly like a
 * real one; if it did not, the throttle would answer "does this account exist"
 * and undo the anti-enumeration work in the same ticket.
 */
@Injectable()
export class LoginThrottleService {
  constructor(private readonly authRepository: AuthRepository) {}

  hashIdentifier(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }

  /**
   * Refuses the attempt when either budget is exhausted, before any password
   * is verified — the point is to stop a guessing loop short of the Argon2
   * work it is trying to make us do.
   */
  async assertWithinLimits(input: { identifierHash: string; ipAddress: string | null }): Promise<void> {
    if (input.ipAddress) {
      const recentFromIp = await this.authRepository.countLoginAttemptsFromIp(
        input.ipAddress,
        new Date(Date.now() - IP_ATTEMPT_WINDOW_MS),
      );
      if (recentFromIp >= MAX_ATTEMPTS_PER_IP_PER_WINDOW) {
        throw buildThrottledError(Math.ceil(IP_ATTEMPT_WINDOW_MS / 1_000));
      }
    }
    await this.assertAccountWithinLimits(input.identifierHash);
  }

  /**
   * The account half of the budget, without the per-IP ceiling.
   *
   * The MFA challenge (SJ-8) uses this rather than the full check. Charging
   * challenges against the per-IP budget would halve the login capacity of a
   * clinic behind one NAT, because every login would spend two of its ten
   * attempts per minute. Nothing is given up: a challenge is unreachable
   * without a login, and that login already paid the IP toll.
   */
  async assertAccountWithinLimits(identifierHash: string): Promise<void> {
    const retryAfterMs = await this.resolveAccountBackoffMs(identifierHash);
    if (retryAfterMs > 0) {
      throw buildThrottledError(Math.ceil(retryAfterMs / 1_000));
    }
  }

  async recordAttempt(input: {
    identifierHash: string;
    ipAddress: string | null;
    succeeded: boolean;
  }): Promise<void> {
    await this.authRepository.createLoginAttempt(input);
  }

  /**
   * Milliseconds still to wait, or 0. Counts the failure streak since the last
   * success rather than raw failures, so one good login always clears the
   * penalty — that is what makes the lock self-healing.
   */
  private async resolveAccountBackoffMs(identifierHash: string): Promise<number> {
    const attempts = await this.authRepository.findRecentLoginAttempts(
      identifierHash,
      new Date(Date.now() - ACCOUNT_WINDOW_MS),
    );
    const streak: Array<{ createdAt: Date }> = [];
    for (const attempt of attempts) {
      if (attempt.succeeded) {
        break;
      }
      streak.push(attempt);
    }
    if (streak.length < FAILURES_BEFORE_BACKOFF) {
      return 0;
    }
    const lastFailure = streak[0];
    if (!lastFailure) {
      return 0;
    }
    const backoffMs = Math.min(
      2 ** (streak.length - FAILURES_BEFORE_BACKOFF) * 1_000,
      MAX_BACKOFF_MS,
    );
    return Math.max(0, lastFailure.createdAt.getTime() + backoffMs - Date.now());
  }
}

/**
 * `Retry-After` is set because a legitimate client that has simply mistyped
 * deserves to know when to try again; it tells an attacker nothing they could
 * not measure by waiting.
 */
function buildThrottledError(retryAfterSeconds: number): HttpException {
  return new HttpException(
    {
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many login attempts. Try again later.',
        details: { retryAfterSeconds },
      },
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

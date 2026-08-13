import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtExpiresIn, resolveJwtExpiresIn } from '../../../common/auth/jwt-expires.util';

/** Fifteen minutes, the product default recorded on SJ-9. */
const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;

/** Sixty seconds of warning, also from the ticket. */
const DEFAULT_WARNING_LEAD_SECONDS = 60;

/**
 * Below this an idle timeout stops being a security control and becomes a
 * nuisance that staff route around — propping a key on the keyboard, or
 * asking for it to be turned off entirely.
 */
const MINIMUM_IDLE_TIMEOUT_MINUTES = 2;

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
 * How long a session may sit untouched before the server kills it (SJ-9).
 *
 * Read once at construction. The threshold is deployment policy — a clinic
 * that wants ten minutes should not need a code change — but it is not
 * something to re-read per request either.
 */
@Injectable()
export class SessionPolicyService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SessionPolicyService.name);
  private readonly idleWindowMs: number;
  private readonly accessTokenLifetimeMs: number;

  constructor(configService: ConfigService) {
    this.idleWindowMs = readIdleTimeoutMs(configService, this.logger);
    this.accessTokenLifetimeMs = parseDurationToMs(
      resolveJwtExpiresIn(configService.get<string>('JWT_ACCESS_EXPIRES_IN'), '15m'),
    );
  }

  /**
   * Refuses to let a misconfiguration go unnoticed.
   *
   * An access token that lives as long as the idle window is a trap: a user
   * who is working normally only refreshes when their access token expires, so
   * the gap between refreshes *is* the access-token lifetime — and if that
   * equals the idle threshold, every active session times out at the boundary.
   * The clinic experiences random logouts every fifteen minutes and nobody
   * connects it to this setting.
   *
   * Warned rather than fatal: refusing to boot over a tuning value would turn
   * a bad afternoon into an outage, and SJ-9's heartbeat means the mistake is
   * survivable in practice.
   */
  onApplicationBootstrap(): void {
    if (this.accessTokenLifetimeMs >= this.idleWindowMs) {
      this.logger.warn(
        `JWT_ACCESS_EXPIRES_IN (${Math.round(this.accessTokenLifetimeMs / 60_000)}m) is not shorter than the session idle timeout (${this.idleTimeoutMinutes}m). Active sessions refresh only as often as the access token expires, so they will be timed out while still in use. Set the access token to roughly a third of the idle window.`,
      );
    }
  }

  get idleTimeoutMs(): number {
    return this.idleWindowMs;
  }

  get idleTimeoutMinutes(): number {
    return Math.round(this.idleWindowMs / 60_000);
  }

  /**
   * How long before the deadline the browser warns. Clamped to a third of the
   * window so a short threshold cannot produce a modal that appears
   * immediately — or, worse, before the session has started.
   */
  get warningLeadSeconds(): number {
    return Math.min(DEFAULT_WARNING_LEAD_SECONDS, Math.floor(this.idleWindowMs / 3_000));
  }

  /** Whether a session last touched at `lastUsedAt` has gone stale. */
  hasIdledOut(lastUsedAt: Date, now: Date = new Date()): boolean {
    return now.getTime() - lastUsedAt.getTime() > this.idleWindowMs;
  }
}

function readIdleTimeoutMs(configService: ConfigService, logger: Logger): number {
  const rawValue = configService.get<string>('SESSION_IDLE_TIMEOUT_MINUTES');
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_IDLE_TIMEOUT_MINUTES * 60_000;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < MINIMUM_IDLE_TIMEOUT_MINUTES) {
    logger.error(
      `SESSION_IDLE_TIMEOUT_MINUTES must be a number of at least ${MINIMUM_IDLE_TIMEOUT_MINUTES}; falling back to ${DEFAULT_IDLE_TIMEOUT_MINUTES}`,
    );
    return DEFAULT_IDLE_TIMEOUT_MINUTES * 60_000;
  }
  return parsed * 60_000;
}

function parseDurationToMs(duration: JwtExpiresIn): number {
  if (typeof duration === 'number') {
    return duration * DURATION_UNIT_MS.s!;
  }
  const match = /^(\d+)(ms|[smhdwy])$/.exec(duration.trim());
  const amount = match?.[1];
  const unit = match?.[2];
  if (!amount || !unit || DURATION_UNIT_MS[unit] === undefined) {
    throw new Error(`Unsupported access token lifetime: ${duration}`);
  }
  return Number(amount) * DURATION_UNIT_MS[unit];
}

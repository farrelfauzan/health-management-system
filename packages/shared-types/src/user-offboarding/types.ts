import { getCalendarDateInTimeZone } from '#registration-flow/schemas';

/**
 * How long an offboarded person keeps vault-only access before their unshared
 * documents are hard-deleted (`P16-T41`, §7.3.10). Thirty days is a
 * deliberate, confirmed product decision; it is short for someone's
 * professional paperwork, which is why the warning goes by email and why the
 * window exists at all.
 */
export const OFFBOARDING_WINDOW_DAYS = 30;

/**
 * Days before the deadline at which the second warning email goes out
 * (FR-E3-27). The first goes on day zero, from the offboard action itself.
 */
export const OFFBOARDING_REMINDER_THRESHOLD_DAYS = 7;

/**
 * The notice thresholds the sweep claims, widest first: the seven-day
 * reminder, then the window closing itself. Keyed the same way as the vault
 * and licence expiry notices so a re-run is a no-op.
 */
export const OFFBOARDING_NOTICE_THRESHOLD_DAYS = [OFFBOARDING_REMINDER_THRESHOLD_DAYS, 0] as const;

/**
 * Everything an offboarded person can do, as permission keys (FR-E3-23/24).
 *
 * This list is the reduced capability set: **view, download, export and
 * delete their own vault documents** — and nothing else. It is a constant in
 * code rather than a seeded role because a role can be edited in the portal
 * and quietly widened; the ability factory branches on `User.offboardedAt`
 * and grants exactly these, and the session claims carry exactly these, so
 * the web tier renders the same reduced surface the API enforces.
 *
 * `vault-document.share:own` is deliberately absent: resignation opens no new
 * doors for anyone. Existing outgoing shares keep resolving for their
 * recipients (FR-E3-29) without the owner holding this key.
 */
export const OFFBOARDED_PERMISSION_KEYS = [
  'vault-document.read:own',
  'vault-document.delete:own',
] as const;

export type OffboardedPermissionKey = (typeof OFFBOARDED_PERMISSION_KEYS)[number];

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Midnight UTC of the clinic calendar day on which the window closes.
 *
 * A date, not an instant: the deadline is "the 4th of October", counted in
 * the clinic's own calendar from the day the person was offboarded, so an
 * offboarding at 23:50 Jakarta time does not lose a day to the server clock.
 */
export function resolveOffboardingDeadline(offboardedAt: Date, timeZone: string): Date {
  const offboardedDay = new Date(
    `${getCalendarDateInTimeZone(offboardedAt, timeZone)}T00:00:00.000Z`,
  );
  return new Date(offboardedDay.getTime() + OFFBOARDING_WINDOW_DAYS * MILLISECONDS_PER_DAY);
}

/**
 * Whole clinic days from `now` until the deadline; zero or negative once it
 * has arrived.
 */
export function resolveOffboardingDaysRemaining(
  offboardedAt: Date,
  now: Date,
  timeZone: string,
): number {
  const today = new Date(`${getCalendarDateInTimeZone(now, timeZone)}T00:00:00.000Z`);
  const deadline = resolveOffboardingDeadline(offboardedAt, timeZone);
  return Math.round((deadline.getTime() - today.getTime()) / MILLISECONDS_PER_DAY);
}

/**
 * Whether the export-only window has closed. Evaluated on the login path
 * itself (FR-E3-26), so a person is refused on the right day whether or not
 * the deletion sweep has run.
 */
export function isOffboardingWindowClosed(
  offboardedAt: Date,
  now: Date,
  timeZone: string,
): boolean {
  return resolveOffboardingDaysRemaining(offboardedAt, now, timeZone) <= 0;
}

/** What survives and what does not, counted at one instant. */
export type OffboardingVaultSummary = {
  readonly sharedDocumentCount: number;
  readonly unsharedDocumentCount: number;
};

/** Which of the two warning emails is being rendered. */
export type OffboardingEmailKind = 'DAY_ZERO' | 'SEVEN_DAYS_LEFT';

export type OffboardingEmailPayload = {
  readonly kind: OffboardingEmailKind;
  readonly deadline: Date;
  readonly summary: OffboardingVaultSummary;
  /** Absolute link to the person's own vault, where export and delete live. */
  readonly vaultUrl: string;
};

/** A user the offboarding sweep has to look at. */
export type OffboardedUserRecord = {
  readonly id: string;
  readonly email: string;
  readonly offboardedAt: Date;
  readonly isActive: boolean;
  readonly roleCodes: readonly string[];
};

/** One document the sweep will remove: the row id and the object behind it. */
export type UnsharedVaultDocumentRecord = {
  readonly id: string;
  readonly storageKey: string;
};

/** What `AdminManagementModule` reads from the environment for offboarding. */
export type UserOffboardingConfig = {
  /** The web origin the emails link to; the vault page lives there, not on the API. */
  readonly webAppBaseUrl: string;
  readonly clinicTimeZone: string;
  readonly isSweepEnabled: boolean;
  readonly sweepIntervalMs: number;
};

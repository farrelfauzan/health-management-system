/**
 * Shapes for the `P17-T05` drain dry run.
 *
 * These stay in `apps/api` rather than in `@hms/shared-types` on purpose: they
 * are an ops script's internal vocabulary, not an API contract. No frontend
 * consumes them, and putting a migration-planning shape in the package that
 * both halves of the product import would outlive the migration by years.
 */

/** What the drain would do with one `patient_profiles` row. */
export type DraftPatientDisposition =
  /**
   * A chat-created record nobody ever attended on. The drain turns it into a
   * `ProspectivePatient` and retires the profile.
   */
  | 'CONVERT'
  /**
   * A chat-created record with clinical activity against it. That person
   * attended, so the record stays and the front desk completes it — moving
   * encounters or invoices between records is not something a migration does.
   */
  | 'KEEP'
  /** Not a chat-created record; the drain does not touch it. */
  | 'OUT_OF_SCOPE';

/**
 * One `patient_profiles` row as the dry run reads it.
 *
 * Booleans rather than the values themselves, deliberately: this report is
 * about *how many* and *which ids*, and a dry run that printed dates of birth
 * would be a patient-data export written to an operator's terminal.
 */
export type DraftPatientRow = {
  id: string;
  mrn: string;
  source: string;
  isSoftDeleted: boolean;
  hasDateOfBirth: boolean;
  hasSex: boolean;
  hasAddress: boolean;
  /** Any encounter, registration, prescription or invoice names this record. */
  hasClinicalActivity: boolean;
  /**
   * A `patient_privacy_notice_records` row names this record.
   *
   * The one column that decides whether the profile can be *removed* at all:
   * that table's FK is `onDelete: Restrict` and it carries a
   * `BEFORE UPDATE OR DELETE` trigger, so evidence rows can be neither deleted
   * nor repointed.
   */
  hasPrivacyEvidence: boolean;
  appointmentCount: number;
  channelLinkCount: number;
};

/** Rows counted one way, with the ids that make the count checkable. */
export type DraftPatientBucket = {
  count: number;
  mrns: string[];
};

/**
 * What the drain (release 2) would move, and what would stop the tightening
 * (release 3) from running.
 */
export type DraftPatientReport = {
  /** Every `CHANNEL_BOOKING` profile, whatever the drain would do with it. */
  channelBookingTotal: number;
  convert: DraftPatientBucket;
  keep: DraftPatientBucket;
  /**
   * Rows the drain would convert that **cannot have their profile removed**,
   * because immutable privacy-notice evidence names them. If this is not zero,
   * the drain rule as written in the ticket cannot be executed as written.
   */
  convertBlockedByPrivacyEvidence: DraftPatientBucket;
  /** Bookings and chat links the drain would have to repoint.  */
  appointmentsToRepoint: number;
  channelLinksToRepoint: number;
  /**
   * Every row in the table — any source, soft-deleted included — that would
   * violate the new `NOT NULL` constraints. `NOT NULL` is a table-wide
   * constraint, so a retired row with a null birth date aborts release 3 just
   * as loudly as a live one.
   */
  tightenBlockers: DraftPatientBucket;
  tightenBlockersBySource: Record<string, number>;
  tightenBlockersByColumn: {
    dateOfBirth: number;
    sex: number;
    address: number;
  };
  /**
   * Blocking rows the drain cannot fix, because the drain only reaches
   * `CHANNEL_BOOKING` records. These need a human before release 3 is even
   * schedulable.
   */
  tightenBlockersOutsideDrainScope: DraftPatientBucket;
};

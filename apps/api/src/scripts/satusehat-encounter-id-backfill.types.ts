/**
 * Script-internal shapes for the `P10-T14` encounter-id backfill. They name
 * database columns and CLI flags directly and never leave `apps/api`, so they
 * stay here rather than in `@hms/shared-types`.
 */
export type SatusehatEncounterIdBackfillOptions = {
  readonly isDryRun: boolean;
  readonly organizationId: string | null;
};

export type LegacySubmissionRow = {
  readonly id: string;
  readonly encounter_id: string;
};

/**
 * What one legacy row resolved to on the platform. `FILLED` is the only branch
 * that writes; the other three are listed for a human, because none of them
 * has a single right answer a script gets to pick.
 */
export type SatusehatEncounterIdOutcome = 'FILLED' | 'NOT_FOUND' | 'AMBIGUOUS' | 'ENCOUNTER_GONE';

export type SatusehatEncounterIdResult = {
  readonly submissionId: string;
  readonly encounterId: string;
  readonly outcome: SatusehatEncounterIdOutcome;
  readonly satusehatEncounterId: string | null;
};

export type SatusehatEncounterIdBackfillSummary = {
  readonly filled: number;
  readonly notFound: number;
  readonly ambiguous: number;
  readonly encounterGone: number;
};

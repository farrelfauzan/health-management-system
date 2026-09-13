/** Whether the seed found a record already there or had to create it. */
export type SandboxSeedRecordOutcome = 'CREATED' | 'EXISTING';

/**
 * How linking one identity to SATUSEHAT ended. `NOT_FOUND` and `AMBIGUOUS` are
 * both failures the operator must act on — the fixture holds only NIKs that
 * resolved to exactly one record when probed, so either means the shared
 * sandbox has drifted since.
 */
export type SandboxSeedLinkOutcome = 'LINKED' | 'ALREADY_LINKED' | 'NOT_FOUND' | 'AMBIGUOUS';

/** One line of the summary. Never carries a NIK. */
export type SandboxSeedLine = {
  label: string;
  record: SandboxSeedRecordOutcome;
  link: SandboxSeedLinkOutcome;
};

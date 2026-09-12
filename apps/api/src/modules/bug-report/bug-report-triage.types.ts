import { AiProviderKindValue } from '@hms/shared-types';

/**
 * Resolved bug-triage settings (P23-T09).
 *
 * Deliberately **not** in `@hms/shared-types`: `apiKey` is a decrypted
 * credential, and the chat gateway's own types make the same call for the same
 * reason — a shared contract is importable from the browser bundle, and a key
 * has no business being in a type the frontend can name.
 *
 * `isConfigured: false` is a supported deployment, not a failure: the worker
 * skips the vendor and settles every report as `FALLBACK`.
 */
export type BugReportTriageConfig = {
  readonly isConfigured: boolean;
  readonly providerKind: AiProviderKindValue | null;
  readonly model: string | null;
  /** Null for a keyless self-hosted upstream (`OLLAMA`), as the chat resolver has it. */
  readonly apiKey: string | null;
  /** Null means the adapter falls back to the vendor's published base URL. */
  readonly baseUrl: string | null;
  readonly timeoutMs: number;
  readonly maxTokens: number;
  readonly workerEnabled: boolean;
  readonly workerPollIntervalMs: number;
  readonly workerBatchSize: number;
  readonly leaseMs: number;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
  /** After this long un-triaged, a report is settled as `FALLBACK` regardless. */
  readonly staleAfterMs: number;
};

/**
 * Resolved Bug Board publishing settings (P23-T10).
 *
 * Separate from the triage config because the two halves fail independently: a
 * deployment can have a triage key and no Notion board, or a board and no
 * triage key, and each answers for itself.
 */
export type BugReportPublishConfig = {
  /**
   * The clinic as the Bug Board's `Clinic` column should read.
   *
   * Its own variable rather than a clinic-profile lookup: the publisher runs in
   * a worker with no request context, and reaching into the clinic-profile
   * module for one string would couple bug reporting to it and add a database
   * read per publish. Required once the Notion connector is configured — a board
   * full of tickets from an unnamed clinic is a board nobody can triage.
   */
  readonly clinicLabel: string;
  readonly workerEnabled: boolean;
  readonly workerPollIntervalMs: number;
  readonly workerBatchSize: number;
  readonly leaseMs: number;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
  /** Days a PUBLISHED report's unredacted text is kept (§5c proposes 30). */
  readonly publishedTextRetentionDays: number;
  /** Days a HELD report's unredacted text is kept (§5c proposes 7). */
  readonly heldTextRetentionDays: number;
};

/**
 * The two moments the purge sweep compares rows against (§5c).
 *
 * Two cutoffs rather than one because the two statuses are held for opposite
 * reasons: a published report's text is kept so a ticket that turned out to
 * matter can be re-triaged, while a held report's text is kept *only* as long as
 * it takes somebody to look at why it was held — it is held precisely because it
 * may name a person.
 */
export type BugReportPurgeCutoffs = {
  readonly publishedBefore: Date;
  readonly heldBefore: Date;
};

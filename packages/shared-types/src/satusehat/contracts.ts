import type {
  SatusehatSubmissionKindValue,
  SatusehatSubmissionStatusValue,
} from '#satusehat/schemas';

/**
 * API response contracts for SATUSEHAT master-data linkage.
 *
 * A patient's IHS number is stored encrypted and treated like the other
 * national identifiers, so its link result only confirms presence — the value
 * is revealed exclusively through the audited patient-identifiers unmask
 * route. A practitioner IHS number is a pseudonymous Kemenkes-issued id
 * stored in plaintext, so its link result carries the value.
 */
export type SatusehatPatientLinkResult = {
  patientId: string;
  hasSatusehatPatientId: boolean;
  alreadyLinked: boolean;
};

export type SatusehatDoctorLinkResult = {
  doctorId: string;
  satusehatPractitionerId: string;
  alreadyLinked: boolean;
};

/**
 * Admin-facing view of one outbox row (P10-T06). Scheduling state only — the
 * outbox stores no payload snapshot, so the view exposes no clinical data and
 * no patient identifiers beyond the local encounter or order UUID.
 *
 * A LAB_REPORT row (P18-T09) carries `labOrderId` and the order number the
 * bench and the patient both quote, and no encounter. Exactly one of the two
 * ids is set, which is what `kind` says.
 */
export type SatusehatSubmissionView = {
  id: string;
  kind: SatusehatSubmissionKindValue;
  encounterId: string | null;
  labOrderId: string | null;
  /**
   * `LAB/YYYYMMDD/####` for a LAB_REPORT row — the local handle an admin
   * chasing a failure works from. Never a value or a patient identifier.
   */
  labOrderNumber: string | null;
  status: SatusehatSubmissionStatusValue;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  submittedAt: string | null;
  satusehatEncounterId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SatusehatSubmissionsListMeta = {
  page: number;
  limit: number;
  total: number;
};

export type SatusehatSubmissionsListResult = {
  items: SatusehatSubmissionView[];
  meta: SatusehatSubmissionsListMeta;
};

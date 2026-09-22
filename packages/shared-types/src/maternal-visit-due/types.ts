import type {
  MaternalVisitDueSourceValue,
  MaternalVisitDueSubjectValue,
} from '#maternal-visit-due/schemas';

/** An inclusive range of clinic-local calendar dates, `YYYY-MM-DD`. */
export type MaternalDueRange = {
  from: string;
  to: string;
};

/**
 * Whose rows a caller may see (P25-T17). `hasAny` is the clinic-wide reach
 * the worker also runs under; otherwise OWN reach is the patient herself and
 * the patients assigned to the caller's clinician profile — the same rule the
 * pregnancy episode and the KB due list apply.
 */
export type MaternalDueReach =
  { hasAny: true } | { hasAny: false; ownerUserId: string; doctorId: string | null };

/**
 * One visit that is due, as a source service reports it. `visitKey` is
 * stable for the visit — the same KF2 of the same birth always has the same
 * key — which is what lets a reminder be sent at most once for it.
 */
export type MaternalDueRecord = {
  visitKey: string;
  source: MaternalVisitDueSourceValue;
  /** `T1`–`T3`, `KF1`–`KN3`, the KB method, or `SHK1`, `SHK2`… */
  code: string;
  subject: MaternalVisitDueSubjectValue;
  patientId: string;
  patientName: string;
  medicalRecordNumber: string | null;
  /** Inclusive clinic-local dates of the window the visit belongs in. */
  dueFrom: string;
  dueUntil: string;
};

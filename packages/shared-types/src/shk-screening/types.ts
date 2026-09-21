import type { ShkResultValue, ShkWorklistFilterValue } from '#shk-screening/schemas';

/** The inputs the SHK status is derived from (P25-T10). */
export type ShkStatusInput = {
  dueFrom: Date;
  dueUntil: Date;
  sampleTakenAt: Date | null;
  sentAt: Date | null;
  resultReceivedAt: Date | null;
  now: Date;
};

/** One sample's window, as absolute instants. */
export type ShkSampleWindow = {
  dueFrom: Date;
  dueUntil: Date;
};

/** What the repository reads for the worklist, scoped by the caller's reach. */
export type ShkWorklistQuery = {
  filter: ShkWorklistFilterValue | null;
  now: Date;
  /** Null for ANY scope; otherwise the clinician whose reach limits the rows. */
  reachDoctorId: string | null;
};

/** What the repository writes when a result arrives. */
export type ShkResultPayload = {
  id: string;
  receivedAt: Date;
  result: ShkResultValue;
  notes: string | null;
  /** Set when the result opens the next sample; null for NORMAL. */
  nextSample: { sequence: number; dueFrom: Date; dueUntil: Date } | null;
};

/** Who a recall is announced to, before de-duplication. */
export type ShkRecallAudience = {
  attendantUserId: string | null;
  clinicianUserIds: string[];
};

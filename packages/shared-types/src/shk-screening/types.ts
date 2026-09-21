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

/** The columns a sample's status and chip are derived from. */
export type ShkScreeningCoreRecord = {
  id: string;
  sequence: number;
  dueFrom: Date;
  dueUntil: Date;
  sampleTakenAt: Date | null;
  sentAt: Date | null;
  resultReceivedAt: Date | null;
  result: ShkResultValue | null;
};

/** Repository projection of one worklist row, with the baby and her birth. */
export type ShkScreeningRecord = ShkScreeningCoreRecord & {
  newbornCareRecordId: string;
  laboratoryName: string | null;
  notes: string | null;
  sampleTakenBy: {
    fullName: string | null;
    email: string;
    doctorProfile: { fullName: string } | null;
  } | null;
  newbornCareRecord: {
    id: string;
    sex: 'MALE' | 'FEMALE';
    newbornPatientId: string | null;
    newbornPatient: { fullName: string } | null;
    deliveryRecord: {
      birthAt: Date;
      attendantDoctorId: string;
      attendantDoctor: { fullName: string; ownerUserId: string | null };
      pregnancyEpisode: { patientId: string; patient: { fullName: string } };
    };
  };
};

/** What a recall notification is raised from. */
export type ShkRecallNotice = {
  attendantUserId: string | null;
  motherPatientId: string;
  motherName: string;
  sequence: number;
};

import type { ShkResultValue, ShkScreeningStatusValue } from '#shk-screening/schemas';

/** One SHK sample on the worklist (P25-T10). */
export type ShkScreeningView = {
  id: string;
  newbornCareRecordId: string;
  /** 1 for the first sample; 2 onwards after a RECALL or an INVALID_SAMPLE. */
  sequence: number;
  status: ShkScreeningStatusValue;
  dueFrom: string;
  dueUntil: string;
  sampleTakenAt: string | null;
  /** The heel prick was recorded before the window opened (< 48 h). Allowed, but shown. */
  isEarly: boolean;
  sampleTakenByName: string | null;
  sentAt: string | null;
  laboratoryName: string | null;
  resultReceivedAt: string | null;
  result: ShkResultValue | null;
  notes: string | null;
  birthAt: string;
  /** The mother, whose pregnancy tab the newborn card lives on. */
  motherPatientId: string;
  motherName: string;
  newbornPatientId: string | null;
  newbornName: string | null;
  sex: 'MALE' | 'FEMALE';
  attendantName: string;
};

/** The newest sample of one baby, as the newborn card's chip shows it. */
export type NewbornShkSummary = {
  id: string;
  sequence: number;
  status: ShkScreeningStatusValue;
  dueFrom: string;
  dueUntil: string;
  isEarly: boolean;
  result: ShkResultValue | null;
};

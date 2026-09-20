import type {
  EstimatedDeliveryDateSourceValue,
  PregnancyEndReasonValue,
  PregnancyEpisodeStatusValue,
} from '#maternal-care/schemas';

/**
 * How far along a pregnancy is, counted from the HPHT (P25-T06). Weeks and
 * days rather than a decimal, because that is how it is said, written on the
 * Buku KIA, and read back at the next visit: "29 minggu 3 hari".
 */
export type GestationalAge = {
  weeks: number;
  days: number;
};

/**
 * Which third of the pregnancy a moment falls in. The boundaries are Permenkes
 * 21/2021 Lampiran I, verified by P25-T01: trimester 1 is 0–12 weeks,
 * trimester 2 is above 12 up to 24, trimester 3 is above 24 until birth.
 */
export type PregnancyTrimester = 1 | 2 | 3;

/** Where a trimester stands against the visits Permenkes 21/2021 requires. */
export type TrimesterScheduleState = 'DONE' | 'DUE' | 'MISSED';

/**
 * One trimester's line in the schedule: what it owes, what it has, and whether
 * the window to make that up has closed.
 */
export type TrimesterScheduleEntry = {
  trimester: PregnancyTrimester;
  requiredVisitCount: number;
  completedVisitCount: number;
  state: TrimesterScheduleState;
  /**
   * The doctor visit Permenkes 21/2021 Pasal 13(4)–(5) requires in this
   * trimester, or null in trimester 2, which requires none (FR-ANC-07).
   */
  doctorVisit: DoctorVisitRequirement | null;
};

/**
 * The two doctor visits with ultrasound a pregnancy must include — one in
 * trimester 1, one in trimester 3 (Permenkes 21/2021 Pasal 13(4)–(5),
 * confirmed by P25-T01 answer 1).
 *
 * `isMet` counts a visit taken elsewhere as well as one taken here: a klinik
 * bidan with no doctor of her own refers the mother out, and marking her
 * non-compliant for a referral she made correctly would be wrong.
 */
export type DoctorVisitRequirement = {
  trimester: PregnancyTrimester;
  isMet: boolean;
  isUltrasoundRecorded: boolean;
};

/**
 * One antenatal visit as the numbering reads it: the encounter, when it
 * started, whether it still counts, and the code frozen onto it at close.
 */
export type AntenatalVisitForNumbering = {
  encounterId: string;
  startedAt: Date;
  isCancelled: boolean;
  frozenVisitCode: AntenatalVisitCodeValue | null;
};

/**
 * The SATUSEHAT ANC visit codes
 * (`terminology.kemkes.go.id/CodeSystem/episodeofcare/ANC`). The list stops at
 * `K6`; a seventh visit carries no code (P25-T01 answer 4).
 */
export type AntenatalVisitCodeValue = 'K1A' | 'K1M' | 'K2' | 'K3' | 'K4' | 'K5' | 'K6';

/** One numbered visit: its ordinal in the episode and the code it maps to. */
export type NumberedAntenatalVisit = {
  encounterId: string;
  ordinal: number;
  visitCode: AntenatalVisitCodeValue | null;
  trimester: PregnancyTrimester | null;
};

/**
 * A doctor visit taken at another facility, as the midwife recorded it
 * (FR-ANC-07). Only what she can know from the mother's book: where, when, and
 * whether an ultrasound was done.
 */
export type ExternalDoctorVisit = {
  facilityName: string;
  visitedAt: Date;
  isUltrasoundDone: boolean;
};

/** One pregnancy episode row, as the repository returns it (P25-T06). */
export type PregnancyEpisodeRecord = {
  id: string;
  patientId: string;
  status: PregnancyEpisodeStatusValue;
  lastMenstrualPeriodDate: Date | null;
  estimatedDeliveryDate: Date;
  eddSource: EstimatedDeliveryDateSourceValue;
  gravida: number;
  para: number;
  abortus: number;
  prePregnancyWeightKg: number | null;
  bloodType: string | null;
  rhesus: string | null;
  riskNotes: string | null;
  endedAt: Date | null;
  endReason: PregnancyEndReasonValue | null;
  createdAt: Date;
};

export type CreatePregnancyEpisodeRecordPayload = {
  patientId: string;
  lastMenstrualPeriodDate: Date | null;
  estimatedDeliveryDate: Date;
  eddSource: EstimatedDeliveryDateSourceValue;
  gravida: number;
  para: number;
  abortus: number;
  prePregnancyWeightKg: number | null;
  bloodType: string | null;
  rhesus: string | null;
  riskNotes: string | null;
  createdById: string;
};

export type UpdatePregnancyEpisodeRecordPayload = {
  lastMenstrualPeriodDate?: Date | null;
  estimatedDeliveryDate?: Date;
  eddSource?: EstimatedDeliveryDateSourceValue;
  gravida?: number;
  para?: number;
  abortus?: number;
  prePregnancyWeightKg?: number | null;
  bloodType?: string | null;
  rhesus?: string | null;
  riskNotes?: string | null;
};

export type EndPregnancyEpisodeRecordPayload = {
  id: string;
  reason: PregnancyEndReasonValue;
  endedAt: Date;
};

/**
 * One antenatal visit as persistence holds it: the encounter it counts, when
 * it started, whether it still counts, the code frozen at close, and whether a
 * doctor rather than a midwife attended — which is what FR-ANC-07 is read off.
 */
export type PregnancyEpisodeVisitRow = {
  id: string;
  encounterId: string;
  pregnancyEpisodeId?: string;
  frozenVisitCode: AntenatalVisitCodeValue | null;
  startedAt: Date;
  encounterStatus: string;
  isAttendedByDoctor: boolean;
};

export type RecordExternalDoctorVisitPayload = {
  pregnancyEpisodeId: string;
  facilityName: string;
  visitedAt: Date;
  isUltrasoundDone: boolean;
  recordedById: string;
};

/** One recorded outside doctor visit, as persistence holds it. */
export type ExternalDoctorVisitRow = {
  id: string;
  facilityName: string;
  visitedAt: Date;
  isUltrasoundDone: boolean;
};

/** The little the episode guards need to know about the patient. */
export type PregnancyEpisodePatientRow = {
  sex: string | null;
  ownerUserId: string | null;
};

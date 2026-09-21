import type {
  DeliveryModeValue,
  EstimatedDeliveryDateSourceValue,
  PerinealTearGradeValue,
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

/** How the baby lies, and the head against the pelvic inlet (P25-T07). */
export type FetalPresentationValue = 'CEPHALIC' | 'BREECH' | 'TRANSVERSE' | 'UNKNOWN';

export type FetalHeadEngagementValue = 'ENGAGED' | 'NOT_ENGAGED';

export type TetanusImmunizationStatusValue = 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

/**
 * What a referral rule needs to exist (P25-T07, FR-ANC-04).
 *
 * `source` is **required**, and that is the whole point: a threshold that
 * sends a mother to a hospital has to be traceable to the page it came from,
 * so a rule cannot be added without citing one.
 */
export type AntenatalReferralRule = {
  code: string;
  label: string;
  /** The Pedoman page or Buku KIA section the threshold is taken from. */
  source: string;
  isTriggered: (input: AntenatalReferralRuleInput) => boolean;
};

/** Everything a referral rule may look at: the visit, and the vitals with it. */
export type AntenatalReferralRuleInput = {
  gestationalAge: GestationalAge;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  muacCm: number | null;
  haemoglobinGramsPerDecilitre: number | null;
  fetalHeartRateBpm: number | null;
  fetalPresentation: FetalPresentationValue | null;
};

/** A rule that fired, with whether the midwife has already set it aside. */
export type TriggeredAntenatalReferralRule = {
  code: string;
  label: string;
  source: string;
  dismissedReason: string | null;
};

/** The ten items of the integrated antenatal standard (P25-T07, FR-ANC-03). */
export type TenTItemCode =
  | 'WEIGHT_AND_HEIGHT'
  | 'BLOOD_PRESSURE'
  | 'MUAC'
  | 'FUNDAL_HEIGHT'
  | 'FETAL_PRESENTATION_AND_HEART_RATE'
  | 'TETANUS_IMMUNIZATION'
  | 'IRON_TABLETS'
  | 'LABORATORY'
  | 'CASE_MANAGEMENT'
  | 'COUNSELLING';

/**
 * Where a checklist item's answer comes from. Named rather than implied, so a
 * midwife reading "NOT_DONE" can tell whether to take a measurement, order a
 * test, or write a note.
 */
export type TenTItemSource =
  | 'VITAL_SIGNS'
  | 'EXAMINATION'
  | 'IMMUNIZATION'
  | 'LAB_ORDER'
  | 'PRESCRIPTION';

export type TenTChecklistItem = {
  code: TenTItemCode;
  source: TenTItemSource;
  isDone: boolean;
};

/** One visit's 10T examination, as persistence holds it. */
export type AntenatalExaminationRow = {
  id: string;
  antenatalVisitId: string;
  muacCm: number | null;
  fundalHeightCm: number | null;
  fetalHeartRateBpm: number | null;
  fetalPresentation: FetalPresentationValue | null;
  fetalHeadEngagement: FetalHeadEngagementValue | null;
  fetalCount: number | null;
  estimatedFetalWeightGrams: number | null;
  tetanusStatus: TetanusImmunizationStatusValue | null;
  ironTabletsGiven: number | null;
  counsellingTopics: string[];
  caseManagementNotes: string | null;
};

/** What the checklist reads off the rest of the encounter. */
export type TenTChecklistSources = {
  hasWeightAndHeight: boolean;
  hasBloodPressure: boolean;
  hasImmunization: boolean;
  hasLabOrder: boolean;
  hasIronPrescription: boolean;
};

/** What the repository needs to upsert one visit's examination (P25-T07). */
export type UpsertAntenatalExaminationPayload = {
  antenatalVisitId: string;
  recordedById: string;
  muacCm?: number | null;
  fundalHeightCm?: number | null;
  fetalHeartRateBpm?: number | null;
  fetalPresentation?: FetalPresentationValue | null;
  fetalHeadEngagement?: FetalHeadEngagementValue | null;
  fetalCount?: number | null;
  estimatedFetalWeightGrams?: number | null;
  tetanusStatus?: TetanusImmunizationStatusValue | null;
  ironTabletsGiven?: number | null;
  counsellingTopics?: string[];
  caseManagementNotes?: string | null;
};

/**
 * What a maternal letter prints about the patient (P25-T07). The NIK arrives
 * as its stored last four digits only — the letter is carried by hand and read
 * by people the clinic never meets, so the plaintext never leaves the
 * identifier columns for this path.
 */
export type MaternalLetterPatient = {
  fullName: string;
  mrn: string;
  dateOfBirth: Date | null;
  sex: string | null;
  address: string | null;
  nikLast4: string | null;
};

/** What the repository writes for a birth (P25-T09). */
export type DeliveryRecordPayload = {
  pregnancyEpisodeId: string;
  attendantDoctorId: string;
  admissionId: string | null;
  labourOnsetAt: Date | null;
  fullDilatationAt: Date | null;
  birthAt: Date;
  placentaDeliveredAt: Date | null;
  postpartumMonitoringEndedAt: Date | null;
  mode: DeliveryModeValue;
  episiotomy: boolean;
  perinealTearGrade: PerinealTearGradeValue;
  uterotonicMedicationId: string | null;
  uterotonicGivenAt: Date | null;
  bloodLossMl: number | null;
  placentaComplete: boolean | null;
  referredOut: boolean;
  referralReason: string | null;
  notes: string | null;
  recordedById: string;
};

/** What the certificate prints about one baby and her birth (FR-INC-05). */
export type BirthCertificateSubject = {
  motherName: string;
  motherNikLast4: string | null;
  babyName: string | null;
  sex: 'MALE' | 'FEMALE';
  birthAt: Date;
  birthWeightGrams: number | null;
  lengthCm: number | null;
  birthOrder: number | null;
  attendantName: string;
  attendantStrNumber: string | null;
};

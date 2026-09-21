import type { NewbornShkSummary } from '#shk-screening/contracts';
import type {
  BirthOutcomeValue,
  DeliveryModeValue,
  EstimatedDeliveryDateSourceValue,
  PerinealTearGradeValue,
  PregnancyEndReasonValue,
  PregnancyEpisodeStatusValue,
} from '#maternal-care/schemas';
import type {
  AntenatalVisitCodeValue,
  FetalHeadEngagementValue,
  FetalPresentationValue,
  GestationalAge,
  PregnancyTrimester,
  TenTChecklistItem,
  TetanusImmunizationStatusValue,
  TriggeredAntenatalReferralRule,
  TrimesterScheduleEntry,
} from '#maternal-care/types';

/** One pregnancy as the API returns it (P25-T06). */
export type PregnancyEpisodeResponse = {
  id: string;
  patientId: string;
  status: PregnancyEpisodeStatusValue;
  lastMenstrualPeriodDate: string | null;
  estimatedDeliveryDate: string;
  eddSource: EstimatedDeliveryDateSourceValue;
  gravida: number;
  para: number;
  abortus: number;
  /** `G2P1A0`, as it is written on the record and read at the counter. */
  gpaLabel: string;
  prePregnancyWeightKg: number | null;
  bloodType: string | null;
  rhesus: string | null;
  riskNotes: string | null;
  endedAt: string | null;
  endReason: PregnancyEndReasonValue | null;
  createdAt: string;
};

/** One antenatal visit in the episode's list. */
export type AntenatalVisitResponse = {
  id: string;
  encounterId: string;
  startedAt: string;
  encounterStatus: string;
  ordinal: number;
  visitCode: AntenatalVisitCodeValue | null;
  trimester: PregnancyTrimester | null;
  gestationalAge: GestationalAge;
};

/** A doctor visit recorded from the Buku KIA (FR-ANC-07). */
export type ExternalDoctorVisitResponse = {
  id: string;
  facilityName: string;
  visitedAt: string;
  isUltrasoundDone: boolean;
};

/**
 * The active episode with everything the Kehamilan tab draws: the header, the
 * numbered visits, how far along she is today, and what each trimester owes.
 */
export type ActivePregnancyEpisodeResponse = {
  episode: PregnancyEpisodeResponse;
  gestationalAge: GestationalAge;
  currentTrimester: PregnancyTrimester;
  visits: AntenatalVisitResponse[];
  externalDoctorVisits: ExternalDoctorVisitResponse[];
  schedule: TrimesterScheduleEntry[];
};

/**
 * What the encounter workspace needs to draw its ANC card: whether this
 * encounter is already counted, and as which visit.
 */
export type EncounterAntenatalVisitResponse = {
  encounterId: string;
  pregnancyEpisodeId: string;
  ordinal: number;
  visitCode: AntenatalVisitCodeValue | null;
  gestationalAge: GestationalAge;
};

/** One visit's 10T examination as the API returns it (P25-T07). */
export type AntenatalExaminationResponse = {
  examination: {
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
  } | null;
  /** Each of the ten items, with where its answer came from. */
  checklist: TenTChecklistItem[];
  /** Sourced prompts this visit's findings set off, dismissed ones included. */
  referralRules: TriggeredAntenatalReferralRule[];
};

/** A maternal document that was rendered and filed (FR-ANC-04, FR-ANC-06). */
export type MaternalDocumentResponse = {
  documentId: string;
  kind: 'REFERRAL_LETTER' | 'PREGNANCY_CERTIFICATE' | 'BIRTH_CERTIFICATE';
  title: string;
  renderedAt: string;
};

/** One baby of a birth, as the pregnancy tab shows her (P25-T09). */
export type NewbornCareView = {
  id: string;
  outcome: BirthOutcomeValue;
  /** Her position among the babies of this birth, whichever column it came from. */
  birthOrder: number | null;
  newbornPatientId: string | null;
  newbornName: string | null;
  sex: 'MALE' | 'FEMALE';
  birthWeightGrams: number | null;
  lengthCm: number | null;
  headCircumferenceCm: number | null;
  apgar1Min: number | null;
  apgar5Min: number | null;
  imdStartedAt: string | null;
  imdDurationMinutes: number | null;
  cordCareAt: string | null;
  vitaminK1GivenAt: string | null;
  eyeProphylaxisGivenAt: string | null;
  hb0ImmunizationId: string | null;
  examinedAt: string | null;
  identityTagAt: string | null;
  /** Her newest SHK sample (P25-T10); null for a stillbirth. */
  shkScreening: NewbornShkSummary | null;
};

/** One recorded birth, with its babies (P25-T09, FR-INC-01). */
export type DeliveryRecordView = {
  id: string;
  pregnancyEpisodeId: string;
  admissionId: string | null;
  attendantDoctorId: string;
  attendantName: string;
  labourOnsetAt: string | null;
  fullDilatationAt: string | null;
  birthAt: string;
  placentaDeliveredAt: string | null;
  postpartumMonitoringEndedAt: string | null;
  mode: DeliveryModeValue;
  episiotomy: boolean;
  perinealTearGrade: PerinealTearGradeValue;
  uterotonicMedicationId: string | null;
  uterotonicName: string | null;
  uterotonicGivenAt: string | null;
  bloodLossMl: number | null;
  placentaComplete: boolean | null;
  referredOut: boolean;
  referralReason: string | null;
  notes: string | null;
  newborns: NewbornCareView[];
};

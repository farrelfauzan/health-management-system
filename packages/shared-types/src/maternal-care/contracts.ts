import type {
  EstimatedDeliveryDateSourceValue,
  PregnancyEndReasonValue,
  PregnancyEpisodeStatusValue,
} from '#maternal-care/schemas';
import type {
  AntenatalVisitCodeValue,
  GestationalAge,
  PregnancyTrimester,
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

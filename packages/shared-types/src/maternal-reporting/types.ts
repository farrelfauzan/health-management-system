import type {
  AcceptorTypeValue,
  ContraceptiveMethodValue,
} from '#maternal-care/family-planning-schemas';
import type {
  BirthOutcomeValue,
  DeliveryModeValue,
  PostnatalSubjectValue,
  PostnatalVisitCodeValue,
} from '#maternal-care/schemas';
import type { AntenatalVisitCodeValue, TetanusImmunizationStatusValue } from '#maternal-care/types';
import type { ShkResultValue } from '#shk-screening/schemas';

/**
 * One column of a register or report layout (P25-T15, D-040). Layouts are
 * configuration: a district that prints a different sheet is a new constant
 * of these, not a rewrite.
 */
export type MaternalReportColumn = {
  /** Stable identifier of the column, independent of its printed label. */
  readonly field: string;
  readonly label: string;
};

/**
 * The month a report covers, resolved once in the clinic's timezone
 * (`CLINIC_TIMEZONE`). Timestamps are compared against the two instants;
 * `@db.Date` columns against the two calendar days.
 */
export type MaternalReportMonthRange = {
  readonly month: string;
  readonly timeZone: string;
  /** The clinic's midnight that opens the month, as a UTC instant. */
  readonly startInclusive: Date;
  /** The clinic's midnight that opens the next month, as a UTC instant. */
  readonly endExclusive: Date;
  /** `YYYY-MM-01`. */
  readonly firstDay: string;
  /** `YYYY-MM-DD` of the month's last day. */
  readonly lastDay: string;
};

export type MaternalReportPatientSource = {
  readonly id: string;
  readonly fullName: string;
  /** Display digits only; the NIK itself is never read for a report. */
  readonly nikLast4: string | null;
  readonly dateOfBirth: Date;
  readonly address: string;
  readonly villageCode: string | null;
  readonly villageName: string | null;
  readonly hasBpjsNumber: boolean;
};

export type MaternalReportLabResultSource = {
  readonly testCode: string;
  readonly loincCode: string | null;
  readonly valueNumeric: number | null;
  readonly valueCoded: string | null;
  readonly valueText: string | null;
};

export type MaternalReportAntenatalVisitSource = {
  readonly pregnancyEpisodeId: string;
  readonly visitCode: AntenatalVisitCodeValue | null;
  readonly startedAt: Date;
  readonly heightCm: number | null;
  readonly muacCm: number | null;
  readonly tetanusStatus: TetanusImmunizationStatusValue | null;
  readonly counsellingTopics: readonly string[];
  readonly caseManagementNotes: string | null;
  readonly labResults: readonly MaternalReportLabResultSource[];
};

export type MaternalReportNewbornSource = {
  readonly id: string;
  readonly outcome: BirthOutcomeValue;
  readonly sex: 'MALE' | 'FEMALE';
  readonly fullName: string | null;
  readonly nikLast4: string | null;
  readonly birthWeightGrams: number | null;
  readonly lengthCm: number | null;
  readonly imdStartedAt: Date | null;
  readonly vitaminK1GivenAt: Date | null;
  readonly eyeProphylaxisGivenAt: Date | null;
  readonly hb0GivenAt: Date | null;
  readonly shkSampleTakenAt: Date | null;
  readonly shkResult: ShkResultValue | null;
};

export type MaternalReportDeliverySource = {
  readonly birthAt: Date;
  readonly mode: DeliveryModeValue;
  readonly attendantName: string;
  readonly perinealTearGrade: string;
  readonly referredOut: boolean;
  readonly referralReason: string | null;
  readonly newborns: readonly MaternalReportNewbornSource[];
};

export type MaternalReportPostnatalVisitSource = {
  readonly pregnancyEpisodeId: string;
  readonly newbornCareRecordId: string | null;
  readonly subject: PostnatalSubjectValue;
  readonly visitCode: PostnatalVisitCodeValue | null;
  readonly startedAt: Date;
  readonly caseManagementNote: string | null;
};

export type MaternalReportFamilyPlanningServiceSource = {
  readonly servedOn: Date;
  readonly action: string;
  readonly nextDueOn: Date | null;
};

export type MaternalReportFamilyPlanningSource = {
  readonly id: string;
  readonly patient: MaternalReportPatientSource;
  readonly method: ContraceptiveMethodValue;
  readonly acceptorType: AcceptorTypeValue;
  readonly startedOn: Date;
  readonly nextDueOn: Date | null;
  readonly discontinuedOn: Date | null;
  readonly discontinuationReason: string | null;
  readonly sideEffects: string | null;
  readonly isPostpartum: boolean;
  readonly providerName: string;
  readonly services: readonly MaternalReportFamilyPlanningServiceSource[];
};

/** One pregnancy with everything the kohort ibu row reads off it. */
export type MaternalReportEpisodeSource = {
  readonly id: string;
  readonly patient: MaternalReportPatientSource;
  readonly estimatedDeliveryDate: Date;
  readonly gravida: number;
  readonly para: number;
  readonly abortus: number;
  readonly bloodType: string | null;
  readonly rhesus: string | null;
  readonly riskNotes: string | null;
  readonly antenatalVisits: readonly MaternalReportAntenatalVisitSource[];
  readonly delivery: MaternalReportDeliverySource | null;
  readonly postnatalVisits: readonly MaternalReportPostnatalVisitSource[];
  readonly postpartumFamilyPlanningMethod: ContraceptiveMethodValue | null;
};

/** One baby in her neonatal period during the month, for the kohort bayi. */
export type MaternalReportNewbornRegisterSource = {
  readonly newborn: MaternalReportNewbornSource;
  readonly birthAt: Date;
  readonly mother: MaternalReportPatientSource;
  readonly postnatalVisits: readonly MaternalReportPostnatalVisitSource[];
};

export type MaternalReportDeathPatientKind = 'MOTHER' | 'NEWBORN' | 'OTHER';

export type MaternalReportDeathSource = {
  readonly admissionId: string;
  readonly patient: MaternalReportPatientSource;
  readonly dischargedAt: Date;
  readonly isRegisteredNewborn: boolean;
  /** When the patient's pregnancies ended, or null for one still open. */
  readonly pregnancyEndDates: readonly (Date | null)[];
};

/** Everything the monthly KIA indicators count over. */
export type MonthlyKiaSource = {
  readonly range: MaternalReportMonthRange;
  readonly antenatalVisits: readonly MaternalReportAntenatalVisitSource[];
  readonly deliveries: readonly MaternalReportDeliverySource[];
  readonly postnatalVisits: readonly MaternalReportPostnatalVisitSource[];
  readonly familyPlanning: readonly MaternalReportFamilyPlanningSource[];
  readonly hb0GivenAt: readonly Date[];
};

export type MonthlyKiaIndicatorDefinition = {
  readonly id: string;
  readonly label: string;
  /** The counting rule in words, printed under the figure. */
  readonly definition: string;
  readonly compute: (source: MonthlyKiaSource) => number;
};

/** The six antenatal laboratory groups of the LB3-KIA sheet. */
export type AntenatalLabTest = 'HB' | 'PROTEIN_URINE' | 'GLUCOSE' | 'HBSAG' | 'SYPHILIS' | 'HIV';

export type AntenatalLabTestMatcher = {
  readonly test: AntenatalLabTest;
  readonly loincCodes: readonly string[];
  readonly localCodes: readonly string[];
};

export type AntenatalLabOutcome = 'EXAMINED' | 'POSITIVE' | 'ANEMIA_MILD' | 'ANEMIA_SEVERE';

export type AntenatalLabClassification = {
  readonly test: AntenatalLabTest;
  readonly isPositive: boolean;
  readonly haemoglobin: number | null;
};

/** One row of a kohort register: the cells in layout order plus the grouping key. */
export type KohortRegisterRow = {
  readonly id: string;
  readonly villageCode: string | null;
  readonly villageName: string | null;
  readonly values: readonly string[];
};

export type MaternalReportVillageOption = {
  readonly code: string | null;
  readonly name: string;
};

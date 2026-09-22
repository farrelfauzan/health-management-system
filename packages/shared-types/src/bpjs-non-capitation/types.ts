import type { DocumentCategoryValue } from '#document-management/schemas';
import type {
  NonCapitationClaimStatusValue,
  NonCapitationServiceTypeValue,
} from '#bpjs-non-capitation/schemas';

/** Doctor or midwife, as `ClinicianProfession` on the clinician profile. */
export type NonCapitationExaminerProfession = 'DOCTOR' | 'MIDWIFE';

/**
 * The BPJS participant a line is claimed for. Only the last four digits of
 * the BPJS number travel; the full number is revealed through
 * `patient.read-identifier` (D-033).
 */
export type NonCapitationPatientSource = {
  readonly id: string;
  readonly fullName: string;
  readonly bpjsNumberLast4: string | null;
};

/** A FINISHED antenatal encounter of a BPJS participant (P25-T06). */
export type NonCapitationAntenatalSource = {
  readonly antenatalVisitId: string;
  readonly encounterId: string;
  readonly startedAt: Date;
  readonly visitCode: string | null;
  readonly examinerProfession: NonCapitationExaminerProfession;
  /** An obstetric ultrasound (ICD-9-CM 88.78) was recorded on the encounter. */
  readonly hasUltrasound: boolean;
  /** A referral was made from the encounter: a surat rujukan or a PCare referral. */
  readonly hasReferral: boolean;
  readonly patient: NonCapitationPatientSource;
};

/** A FINISHED nifas visit of a BPJS mother with a KF code (P25-T12). */
export type NonCapitationPostnatalSource = {
  readonly postnatalVisitId: string;
  readonly encounterId: string;
  readonly startedAt: Date;
  readonly visitCode: 'KF1' | 'KF2' | 'KF3' | 'KF4';
  readonly examinerProfession: NonCapitationExaminerProfession;
  readonly hasReferral: boolean;
  readonly patient: NonCapitationPatientSource;
};

/** A recorded birth of a BPJS mother (P25-T09). */
export type NonCapitationDeliverySource = {
  readonly deliveryRecordId: string;
  readonly birthAt: Date;
  readonly admissionId: string | null;
  readonly attendantProfession: NonCapitationExaminerProfession;
  /** The registered babies: the surat keterangan lahir is filed on them. */
  readonly newbornPatientIds: readonly string[];
  readonly patient: NonCapitationPatientSource;
};

/**
 * A family planning act of a BPJS participant (P25-T14): the start of a
 * course, or one follow-up service of it. `servedOn` is a `@db.Date`.
 */
export type NonCapitationFamilyPlanningSource = {
  readonly sourceId: string;
  readonly kind: 'COURSE_START' | 'SERVICE';
  readonly method: string;
  readonly acceptorType: 'NEW' | 'CONTINUING';
  readonly servedOn: Date;
  readonly encounterId: string | null;
  /** For a SERVICE: it set a next due date, which is what a reinjection does. */
  readonly setsNextDueDate: boolean;
  readonly examinerProfession: NonCapitationExaminerProfession;
  readonly patient: NonCapitationPatientSource;
};

/** A filed clinical document's category and anchors, never its content. */
export type NonCapitationDocumentSource = {
  readonly patientId: string;
  readonly encounterId: string | null;
  readonly admissionId: string | null;
  readonly category: DocumentCategoryValue;
  /** `YYYY-MM-DD`: the document date, or the day it was filed when it has none. */
  readonly filedOn: string;
};

/** One tariff row, with its validity as `YYYY-MM-DD`. */
export type NonCapitationTariffSource = {
  readonly id: string;
  readonly serviceType: NonCapitationServiceTypeValue;
  readonly amount: number;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly regulationReference: string;
};

export type NonCapitationMarkSource = {
  readonly serviceType: NonCapitationServiceTypeValue;
  readonly sourceId: string;
  readonly markedAt: Date;
};

/** Every record one month's recap is derived from. */
export type NonCapitationRecapSources = {
  readonly antenatal: readonly NonCapitationAntenatalSource[];
  readonly postnatal: readonly NonCapitationPostnatalSource[];
  readonly deliveries: readonly NonCapitationDeliverySource[];
  readonly familyPlanning: readonly NonCapitationFamilyPlanningSource[];
  readonly documents: readonly NonCapitationDocumentSource[];
  readonly tariffs: readonly NonCapitationTariffSource[];
  readonly marks: readonly NonCapitationMarkSource[];
};

/**
 * One payable unit before it is priced and checked: what was done, for whom,
 * on which day, and what a supporting document would be anchored to.
 */
export type NonCapitationUnit = {
  readonly serviceType: NonCapitationServiceTypeValue;
  readonly sourceId: string;
  /** `YYYY-MM-DD` in the clinic's timezone. */
  readonly serviceDate: string;
  readonly visitLabel: string | null;
  readonly examinerProfession: NonCapitationExaminerProfession | null;
  readonly patient: NonCapitationPatientSource;
  /** Whose documents count: the mother, and for a delivery her babies. */
  readonly documentPatientIds: readonly string[];
  readonly encounterId: string | null;
  readonly admissionId: string | null;
};

/** The dates every line of one recap is judged against. */
export type NonCapitationRecapClock = {
  readonly timeZone: string;
  /** `YYYY-MM-DD`, today in the clinic's timezone. */
  readonly today: string;
  /** `YYYY-MM-DD`, the induk's filing date for the recap month. */
  readonly filingDeadline: string;
};

/** What the claim status of one line is decided from. */
export type NonCapitationClaimStatusInput = {
  readonly isMarked: boolean;
  readonly today: string;
  readonly filingDeadline: string;
  readonly expiresOn: string;
};

/** Internal: the status counts keyed by status. */
export type NonCapitationStatusCounts = Record<NonCapitationClaimStatusValue, number>;

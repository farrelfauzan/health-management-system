import type {
  ClinicianProfessionValue,
  DoctorAuthorityGrantKindValue,
  DoctorAuthorityKindValue,
  DoctorEducationInput,
  DoctorMandateKindValue,
  DoctorLicenseTypeValue,
} from '#doctor-management/schemas';
import type { SpecialtySummary } from '#specialty/contracts';

/**
 * License entry as the repository persists it. The service converts the
 * YYYY-MM-DD schema input into `Date` values before crossing this boundary.
 */
export type DoctorLicenseWritePayload = {
  type: DoctorLicenseTypeValue;
  licenseNumber: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
};

export type ListDoctorsParams = {
  page: number;
  limit: number;
  search?: string;
  specialtyId?: string;
  patientId?: string;
  isActive?: boolean;
  /** `true` keeps only doctors with no NIK on file, `false` only those with one. */
  missingNik?: boolean;
  profession?: ClinicianProfessionValue;
};

export type CreateDoctorRecordPayload = {
  licenseNumber: string;
  fullName: string;
  specialtyId: string;
  profession: ClinicianProfessionValue;
  phoneNumber: string;
  title?: string;
  degrees?: string;
  nik: string;
  npwp?: string;
  licenses?: DoctorLicenseWritePayload[];
  educations?: DoctorEducationInput[];
  ownerUserId?: string;
  isActive: boolean;
  patientIds?: string[];
  actorUserId: string;
};

export type UpdateDoctorRecordPayload = {
  fullName?: string;
  specialtyId?: string;
  profession?: ClinicianProfessionValue;
  phoneNumber?: string;
  title?: string | null;
  degrees?: string | null;
  nik?: string;
  npwp?: string | null;
  /** When present, replaces the whole active license list. */
  licenses?: DoctorLicenseWritePayload[];
  /** When present, replaces the whole active education list. */
  educations?: DoctorEducationInput[];
  ownerUserId?: string | null;
  isActive?: boolean;
};

/**
 * One outstanding invitation to the account a doctor will sign in with
 * (P19-T15). The address lives here rather than on `DoctorProfile` for the
 * same reason it lives on `User` once accepted: one stored copy, and this row
 * is where it is stored until the account exists.
 */
export type DoctorPendingInvitation = {
  email: string;
  expiresAt: Date;
};

export type DoctorRecord = {
  id: string;
  licenseNumber: string;
  fullName: string;
  specialtyId: string;
  specialty: SpecialtySummary;
  profession: ClinicianProfessionValue;
  phoneNumber: string | null;
  title: string | null;
  degrees: string | null;
  /**
   * Masked last four digits only — the `nikCiphertext` and `nikIndex` columns
   * never leave the repository layer, and the plaintext NIK is never read back.
   */
  nikLast4: string | null;
  /** The clinician's own NPWP, digits only, for the BP21 on their fees (P27-T07). */
  npwp: string | null;
  satusehatPractitionerId: string | null;
  ownerUserId: string | null;
  /** The doctor's email, read from their account — the only stored copy. */
  ownerUser: { email: string } | null;
  /**
   * Invitations raised for this profile that nobody has accepted and nobody
   * has withdrawn, newest first. Optional because it is a projection some
   * queries do not ask for; read it through a `?? []` rather than assuming the
   * caller selected it. `expiresAt` rides along because a lapsed invitation is
   * still an unconsumed row, and only the reader knows what "now" is.
   */
  ownerInvitations?: DoctorPendingInvitation[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type DoctorLicenseRecord = {
  id: string;
  type: DoctorLicenseTypeValue;
  licenseNumber: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DoctorEducationRecord = {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy: string | null;
  graduationYear: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DoctorScheduleRecord = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  maxPatients: number | null;
};

/**
 * Decrypted practitioner identifier, produced only by the repository's explicit
 * unmask query. Practitioner equivalent of `PatientIdentifierPlaintext`.
 */
export type DoctorIdentifierPlaintext = {
  nik: string | null;
};

export type ReplaceDoctorSchedulesPayload = {
  doctorId: string;
  entries: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
    maxPatients?: number | null;
  }>;
};

/**
 * One licence row as the expiry query returns it (P16-T19), joined to its
 * doctor for display. Carries no document reference, and the repository query
 * behind it does not touch the `documents` table at all — see
 * {@link DoctorLicenseExpiryRow} for why that absence is load-bearing.
 */
export type DoctorLicenseExpiryRecord = {
  licenseId: string;
  doctorId: string;
  doctorName: string;
  type: DoctorLicenseTypeValue;
  licenseNumber: string;
  issuedAt: Date | null;
  /** Never null: rows without an expiry are excluded by the query. */
  expiresAt: Date;
};

/**
 * How far ahead of expiry the clinic is told, in days (P16-T19, FR-E3-34).
 * `0` is the day it lapses. Ordered widest first so the job can walk them and
 * take the first that has been crossed.
 */
export const DOCTOR_LICENSE_EXPIRY_THRESHOLD_DAYS = [60, 30, 0] as const;

/**
 * The dashboard's bucket boundaries, in days ahead of today. Expiry itself is
 * the implicit fourth bucket below zero.
 */
export const DOCTOR_LICENSE_EXPIRY_BUCKET_DAYS = [30, 60, 90] as const;

/**
 * A stored doctor profile as the completeness check reads it (P20-T02): keyed
 * by column, so the check can look up whichever fields the create schema
 * requires. `nikLast4` is how an encrypted NIK's presence is read.
 */
export type DoctorProfileCompletenessRecord = Readonly<Record<string, unknown>> & {
  readonly nikLast4?: string | null;
};

/**
 * The one method of a Zod field the completeness check needs. Structural, so
 * the check does not depend on which Zod major the caller's schema was built
 * with.
 */
type CompletenessFieldSchema = {
  isOptional(): boolean;
  isNullable(): boolean;
};

export type ResolveMissingDoctorProfileFieldsParams = {
  /** Null when the account has no doctor profile at all. */
  profile: DoctorProfileCompletenessRecord | null;
  /** The schema whose required keys define "complete". Defaults to create-doctor. */
  schema?: { shape: Readonly<Record<string, CompletenessFieldSchema>> };
};

/**
 * How far ahead of `validUntil` the clinic is told an authority lapses, in
 * days (P25-T02, FR-AUTH-05). `0` is the day it lapses. Mirrors the licence
 * thresholds deliberately rather than sharing them.
 */
export const DOCTOR_AUTHORITY_EXPIRY_THRESHOLD_DAYS = [60, 30, 0] as const;

/** Inside this many days of `validUntil` the card shows "expiring soon". */
export const DOCTOR_AUTHORITY_EXPIRING_SOON_DAYS = 60;

/** The clinician an authority is granted to, as the repository reads it. */
export type DoctorAuthorityClinicianRecord = {
  id: string;
  fullName: string;
  profession: ClinicianProfessionValue;
};

/** One `doctor_authorities` row as the repository returns it. */
export type DoctorAuthorityRecord = {
  id: string;
  doctorId: string;
  kind: DoctorAuthorityKindValue;
  grantKind: DoctorAuthorityGrantKindValue;
  grantReference: string;
  grantIssuedAt: Date;
  trainingCertificateNumber: string;
  validFrom: Date;
  validUntil: Date;
  grantDocumentStorageKey: string | null;
  grantDocumentMimeType: string | null;
  grantDocumentSizeBytes: number | null;
  revokedAt: Date | null;
  revokedById: string | null;
  revokeReason: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/**
 * One pelimpahan as stored (P25-T05). `icd9cmCodes` is what makes it
 * enforceable: the procedure gate asks whether the code in front of it is on
 * this list, so a mandate for an IUD insertion never covers a caesarean.
 */
export type DoctorMandateRecord = {
  id: string;
  midwifeDoctorId: string;
  mandatingDoctorId: string;
  mandatingDoctorName: string;
  kind: DoctorMandateKindValue;
  instruction: string;
  icd9cmCodes: string[];
  validFrom: Date;
  validUntil: Date;
  instructionStorageKey: string;
  instructionMimeType: string;
  instructionSizeBytes: number;
  revokedAt: Date | null;
  revokedById: string | null;
  revokeReason: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type CreateDoctorMandateRecordPayload = {
  midwifeDoctorId: string;
  mandatingDoctorId: string;
  kind: DoctorMandateKindValue;
  instruction: string;
  icd9cmCodes: string[];
  validFrom: Date;
  validUntil: Date;
  instructionDocument: DoctorAuthorityGrantDocumentPayload;
  createdById: string;
};

export type RevokeDoctorMandateRecordPayload = {
  revokedById: string;
  revokeReason: string;
  revokedAt: Date;
};

/**
 * The question the procedure gate asks when a midwife lacks the authority an
 * action needs (P25-T05): is this code covered by a live mandate on the day it
 * was performed? A mandate also covers a code that needs no authority at all,
 * so the gate asks it for every procedure a midwife records.
 */
export type FindCoveringDoctorMandateParams = {
  midwifeDoctorId: string;
  icd9cmCode: string;
  onDate: Date;
};

/** The stored grant document, verified against storage before it is recorded. */
export type DoctorAuthorityGrantDocumentPayload = {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
};

export type CreateDoctorAuthorityRecordPayload = {
  doctorId: string;
  kind: DoctorAuthorityKindValue;
  grantKind: DoctorAuthorityGrantKindValue;
  grantReference: string;
  grantIssuedAt: Date;
  trainingCertificateNumber: string;
  validFrom: Date;
  validUntil: Date;
  grantDocument: DoctorAuthorityGrantDocumentPayload | null;
  createdById: string;
};

/**
 * Only the fields the update route may touch; `kind` is absent by type and
 * `validUntil` cannot be null. A `grantDocument` of `null` detaches the
 * document, `undefined` leaves it alone.
 */
export type UpdateDoctorAuthorityRecordPayload = {
  grantKind?: DoctorAuthorityGrantKindValue;
  grantReference?: string;
  grantIssuedAt?: Date;
  trainingCertificateNumber?: string;
  validFrom?: Date;
  validUntil?: Date;
  grantDocument?: DoctorAuthorityGrantDocumentPayload | null;
};

export type RevokeDoctorAuthorityRecordPayload = {
  revokedById: string;
  revokeReason: string;
  revokedAt: Date;
};

/**
 * The question P25-T03 asks before letting a midwife act (`hasActiveAuthority`).
 * `onDate` is a YYYY-MM-DD clinic-local calendar date; omitted, the service
 * resolves today in `CLINIC_TIMEZONE`.
 */
export type HasActiveDoctorAuthorityParams = {
  doctorId: string;
  kind: DoctorAuthorityKindValue;
  onDate?: string;
};

/**
 * One authority row as the expiry sweep reads it, joined to its clinician for
 * the notification's copy.
 */
export type DoctorAuthorityExpiryRecord = {
  authorityId: string;
  doctorId: string;
  doctorName: string;
  kind: DoctorAuthorityKindValue;
  grantKind: DoctorAuthorityGrantKindValue;
  grantReference: string;
  validUntil: Date;
};

/** A swept authority with its distance to `validUntil` and the threshold it crossed. */
export type DoctorAuthorityExpiryCandidate = {
  record: DoctorAuthorityExpiryRecord;
  daysUntilExpiry: number;
  thresholdDays: number;
};

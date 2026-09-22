import type { DoctorCredentialValue } from '#doctor-credential-option/contracts';
import type {
  ClinicianProfessionValue,
  DoctorAuthorityGrantKindValue,
  DoctorAuthorityKindValue,
  DoctorInvitationStatusValue,
  DoctorLicenseTypeValue,
  DoctorMandateKindValue,
  DoctorMandatePolicyWarningValue,
} from '#doctor-management/schemas';

export type DoctorProfile = {
  id: string;
  licenseNumber: string;
  fullName: string;
  specialtyId: string;
  specialty: string;
  /** Doctor or midwife (D-034). Every profile created before P24-T02 is `DOCTOR`. */
  profession: ClinicianProfessionValue;
  phoneNumber?: string;
  /**
   * Read from the linked user account, not stored on the profile. While an
   * invitation raised at creation is still outstanding there is no account
   * yet, so it is read from that invitation instead — either way there is
   * exactly one stored copy of the address, and it is the one they sign in
   * with. Absent only when the doctor has neither an account nor a live
   * invitation — `invitationStatus` is then `NO_ACCOUNT`.
   */
  email?: string;
  /**
   * Whether the doctor can sign in yet (P19-T15). `ACCEPTED` means an account
   * is linked, whether it was created by accepting the invitation or already
   * existed and was attached. `PENDING` means an invitation is outstanding and
   * still usable. `NO_ACCOUNT` means neither — the doctor predates the rule
   * that every create collects an address (P20-T01), or the invitation lapsed
   * or was withdrawn without being replaced. Always present.
   */
  invitationStatus: DoctorInvitationStatusValue;
  /**
   * The title's *printed* form ("dr."), not the stored code — every reader
   * wanted the printed form before P19-T14 and still does. Absent when the
   * doctor has no title on file.
   */
  title?: string;
  /** The printed degrees, in order, joined for display: `Sp.PD, M.Kes`. */
  degrees?: string;
  /** The title as code + label + legacy flag, for the form that edits it. */
  titleValue?: DoctorCredentialValue;
  /** Each stored degree as code + label + legacy flag, in stored order. */
  degreeValues: DoctorCredentialValue[];
  /** `dr. Andi Prasetyo, Sp.PD` — the one composed form, built by the API. */
  displayName: string;
  /**
   * Masked NIK (`••••••••0001`), rendered from the stored last four digits
   * without decrypting a row. Absent when no NIK is on file. Full values come
   * from `GET /doctors/{id}/identifiers`, which requires
   * `doctor.read-identifier` and is audited.
   */
  nikMasked?: string;
  /**
   * The clinician's own NPWP, digits only (P27-T07). Not secret the way a
   * NIK is — it is printed on every bukti potong — so it rides along in full.
   */
  npwp?: string;
  satusehatPractitionerId?: string;
  ownerUserId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DoctorLicense = {
  id: string;
  type: DoctorLicenseTypeValue;
  licenseNumber: string;
  issuedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type DoctorEducation = {
  id: string;
  institution: string;
  degree: string;
  /** The field of study's printed form ("Pendidikan Dokter"), not the code. */
  fieldOfStudy?: string;
  /** The same value as code + label + legacy flag, for the form that edits it. */
  fieldOfStudyValue?: DoctorCredentialValue;
  graduationYear?: number;
  createdAt: string;
  updatedAt: string;
};

export type DoctorRelatedPatient = {
  id: string;
  assignmentId: string;
  mrn: string;
  fullName: string;
};

export type DoctorScheduleEntry = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  maxPatients: number | null;
};

export type DoctorListItem = DoctorProfile & {
  patientCount: number;
  schedules: DoctorScheduleEntry[];
};

export type DoctorDetail = DoctorProfile & {
  patientCount: number;
  schedules: DoctorScheduleEntry[];
  licenses: DoctorLicense[];
  educations: DoctorEducation[];
  patients?: DoctorRelatedPatient[];
};

/**
 * Full, decrypted practitioner identifiers. Same rules as the patient
 * equivalent: dedicated route, `doctor.read-identifier` permission, audited on
 * every read. STR and SIP numbers are absent because they are not secret —
 * KKI/IDI publish them, so they ride along unmasked on `DoctorDetail`.
 */
export type DoctorIdentifiers = {
  id: string;
  nik?: string;
};

export type DoctorsListMeta = {
  page: number;
  limit: number;
  total: number;
};

/**
 * One practitioner licence on the expiry dashboard (P16-T19, FR-E3-33).
 *
 * Every field here is a number, a date, or a name the clinic already
 * administers on `DoctorLicense`. There is deliberately **no document field
 * of any kind** — no id, no filename, no `hasScan` boolean, not even a null
 * one. The absence is the contract: a reader cannot learn from this payload
 * whether the doctor has uploaded a scan of this licence, including a scan
 * they shared with the reader (FR-E3-35). Adding one would take a change to
 * this type and the OpenAPI contract it generates, which is exactly the
 * friction it is shaped to create.
 */
export type DoctorLicenseExpiryRow = {
  licenseId: string;
  doctorId: string;
  doctorName: string;
  type: DoctorLicenseTypeValue;
  licenseNumber: string;
  issuedAt: string | null;
  expiresAt: string;
  /**
   * Whole days from today to `expiresAt`, negative once it has passed. Sent
   * rather than left to the client so every reader counts from the same day
   * — the clinic's timezone, not the browser's.
   */
  daysUntilExpiry: number;
};

/**
 * The expiry dashboard, bucketed by urgency (FR-E3-33). Buckets rather than a
 * flat sorted list because the question an administrator asks is "what is
 * already a problem, and what becomes one this quarter" — two ends of a
 * spectrum that a single ordering blurs. Each bucket is urgency-sorted
 * within itself.
 */
export type DoctorLicenseExpiryBucketsView = {
  expired: DoctorLicenseExpiryRow[];
  within30Days: DoctorLicenseExpiryRow[];
  within60Days: DoctorLicenseExpiryRow[];
  within90Days: DoctorLicenseExpiryRow[];
};

/**
 * Lifecycle of one authority as the card renders it (P25-T02). Computed by
 * the API against the clinic's calendar day so two readers never disagree.
 */
export type DoctorAuthorityStatusValue = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'REVOKED';

/**
 * One midwife authority (kewenangan) as the API returns it (D-036). Storage
 * columns are never exposed: `hasGrantDocument` says whether the evidence
 * document is on file, and the download route signs a URL for it.
 */
export type DoctorAuthority = {
  id: string;
  doctorId: string;
  kind: DoctorAuthorityKindValue;
  grantKind: DoctorAuthorityGrantKindValue;
  grantReference: string;
  grantIssuedAt: string;
  trainingCertificateNumber: string;
  validFrom: string;
  /** Always set: the government sets the period, so no grant is open-ended. */
  validUntil: string;
  hasGrantDocument: boolean;
  grantDocumentMimeType: string | null;
  status: DoctorAuthorityStatusValue;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * One pelimpahan as the clinician page shows it (P25-T05). `status` is judged
 * the same way an authority's is — on the clinic's calendar day — so a mandate
 * that ran out yesterday reads as EXPIRED rather than as an active record with
 * a date somebody has to compare themselves.
 */
export type DoctorMandate = {
  id: string;
  midwifeDoctorId: string;
  mandatingDoctorId: string;
  /** Shown on every procedure performed under it: who answers for the action. */
  mandatingDoctorName: string;
  kind: DoctorMandateKindValue;
  instruction: string;
  icd9cmCodes: string[];
  validFrom: string;
  validUntil: string;
  instructionMimeType: string;
  status: DoctorAuthorityStatusValue;
  /**
   * Rules that no longer refuse a mandate but still deserve saying out loud
   * (D-036 §3) — an overlap with a live mandate, or a delegation whose window
   * is not the 1–3 month absence PP 28/2024 Pasal 745(3) describes.
   */
  policyWarnings: DoctorMandatePolicyWarningValue[];
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
  updatedAt: string;
};

/** What a procedure says about the mandate it was performed under (P25-T05). */
export type ProcedureMandateSummary = {
  id: string;
  kind: DoctorMandateKindValue;
  /**
   * The doctor who granted it. Under a MANDATE she is the responsible
   * clinician; under a DELEGATION responsibility moved to the midwife, which
   * is why `kind` travels beside the name rather than the name alone.
   */
  mandatingDoctorName: string;
};

export type DoctorAuthorityUploadUrlView = {
  url: string;
  storageKey: string;
  expiresAt: string;
  requiredHeaders: Readonly<Record<string, string>>;
};

export type DoctorAuthorityDownloadView = {
  url: string;
  expiresAt: string;
};

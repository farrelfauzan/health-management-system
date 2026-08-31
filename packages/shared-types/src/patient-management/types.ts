import type {
  AllergySeverityValue,
  BloodTypeValue,
  MaritalStatusValue,
  PatientAllergyInput,
  PatientRecordSourceValue,
  PatientSexValue,
  PatientStatusValue,
  PrivacyNoticeEvidenceInput,
  PrivacyNoticeOutcomeValue,
  ReligionValue,
  RhesusFactorValue,
} from '#patient-management/schemas';

/**
 * Demographic and clinical-safety fields shared by the create and update
 * repository payloads. `undefined` leaves a field untouched; `null` clears it.
 */
export type PatientDemographicFields = {
  email?: string | null;
  bloodType?: BloodTypeValue | null;
  rhesusFactor?: RhesusFactorValue | null;
  maritalStatus?: MaritalStatusValue | null;
  occupation?: string | null;
  religion?: ReligionValue | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  guardianName?: string | null;
  guardianRelation?: string | null;
};

export type PatientAllergyRecord = {
  id: string;
  substance: string;
  reaction: string | null;
  severity: AllergySeverityValue;
  createdAt: Date;
  updatedAt: Date;
};

export type ListPatientsParams = {
  page: number;
  limit: number;
  search?: string;
  nik?: string;
  bpjsNumber?: string;
  doctorId?: string;
  status?: PatientStatusValue;
  hasAppointment?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
};

export type CreatePatientRecordPayload = {
  /**
   * Legacy import only. Omitted for an ordinary create, in which case the
   * repository allocates the next MRN from the counter inside the same
   * transaction as the insert.
   */
  mrn?: string;
  fullName: string;
  /**
   * Null only on the chat-created draft path (`PCS-T07`): §5.3 forbids asking
   * for a date of birth over an unauthenticated channel, and a placeholder
   * date in a 25-year clinical record is worse than an absence. Every
   * human-facing create still supplies it — `createPatientSchema` keeps it
   * required.
   */
  dateOfBirth: Date | null;
  placeOfBirth?: string;
  /** Null on the draft path, for the same reason as {@link dateOfBirth}. */
  sex: PatientSexValue | null;
  status: PatientStatusValue;
  phoneNumber: string;
  /** Null on the draft path, for the same reason as {@link dateOfBirth}. */
  address: string | null;
  /**
   * Defaults to `FRONT_DESK` at the database, so only the channel path names
   * it.
   */
  source?: PatientRecordSourceValue;
  nik?: string;
  bpjsNumber?: string;
  ownerUserId?: string;
  isActive: boolean;
  doctorIds?: string[];
  allergies?: PatientAllergyInput[];
  actorUserId: string;
  privacyNotice: PrivacyNoticeEvidenceInput;
  /**
   * Set only by the arrival-conversion path (`P17-T04`): the prospective
   * record this create is resolving.
   *
   * It rides on the create payload rather than being a second call afterwards
   * because the two writes have to be one transaction. The MRN is allocated
   * inside this insert, and a conversion that allocated a number and then
   * failed to repoint the booking would leave a person holding a reference
   * code that names a record nobody can find — with the number already spent.
   */
  convertsProspectivePatient?: ConvertsProspectivePatient;
} & PatientDemographicFields;

/** The prospective record an arrival conversion resolves (`P17-T04`). */
export type ConvertsProspectivePatient = {
  prospectivePatientId: string;
  convertedAt: Date;
};

/**
 * A create that also resolved a prospective record (`P17-T04`).
 *
 * `movedAppointments` is counted inside the transaction rather than re-read
 * after it, so the number the counter is shown is the number that actually
 * committed.
 */
export type CreatePatientFromProspectiveResult = {
  patient: PatientRecord;
  movedAppointments: number;
};

export type UpdatePatientRecordPayload = {
  fullName?: string;
  dateOfBirth?: Date;
  placeOfBirth?: string | null;
  sex?: PatientSexValue;
  status?: PatientStatusValue;
  phoneNumber?: string;
  address?: string;
  nik?: string | null;
  bpjsNumber?: string | null;
  ownerUserId?: string | null;
  isActive?: boolean;
  /** When present, replaces the whole active allergy list. */
  allergies?: PatientAllergyInput[];
} & PatientDemographicFields;

/**
 * Domain projection of a patient row. Identifiers appear only as their masked
 * last four digits: the `*Ciphertext` and `*Index` columns never leave the
 * repository layer, and the plaintext identifier is never read back here.
 */
export type PatientRecord = {
  id: string;
  mrn: string;
  fullName: string;
  /** Absent on a chat-created draft until the counter completes it (§5.2). */
  dateOfBirth: Date | null;
  placeOfBirth: string | null;
  sex: PatientSexValue | null;
  status: PatientStatusValue;
  phoneNumber: string;
  /** Absent on a chat-created draft until the counter completes it (§5.2). */
  address: string | null;
  source: PatientRecordSourceValue;
  nikLast4: string | null;
  bpjsNumberLast4: string | null;
  hasSatusehatPatientId: boolean;
  email: string | null;
  bloodType: BloodTypeValue | null;
  rhesusFactor: RhesusFactorValue | null;
  maritalStatus: MaritalStatusValue | null;
  occupation: string | null;
  religion: ReligionValue | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  guardianName: string | null;
  guardianRelation: string | null;
  ownerUserId: string | null;
  isActive: boolean;
  lastVisitAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * One registry record a chat customer's typed phone number resolved to
 * (`PCS-T07`, strategy §5.1).
 *
 * **This projection never leaves the API.** §5.1.1 forbids the reply or the
 * tool result revealing whether a number matched anything, so what a match
 * produces is three fields for an internal decision — never a patient record.
 */
export type PatientPhoneMatch = {
  id: string;
  fullName: string;
  source: PatientRecordSourceValue;
};

export type PrivacyNoticeVersionRecord = {
  id: string;
  version: string;
  effectiveAt: Date;
  contentId: string;
  contentEn: string;
  contentHashId: string;
  contentHashEn: string;
  counselApproved: boolean;
};

export type PatientPrivacyNoticeRecord = {
  id: string;
  patientId: string;
  privacyNoticeVersionId: string;
  version: string;
  outcome: PrivacyNoticeOutcomeValue;
  locale: 'id' | 'en';
  contentHash: string;
  subjectType: 'SELF' | 'REPRESENTATIVE';
  representativeName: string | null;
  representativeRelation: string | null;
  actorUserId: string;
  provenance: PrivacyNoticeEvidenceInput['provenance'];
  recordedAt: Date;
};

/**
 * Decrypted identifiers, produced only by the repository's explicit unmask
 * query. This is the one projection allowed to carry plaintext: it never feeds
 * a list or detail response, is reachable only with `patient.read-identifier`,
 * and every read of it is audited.
 */
export type PatientIdentifierPlaintext = {
  nik: string | null;
  bpjsNumber: string | null;
  satusehatPatientId: string | null;
};

/**
 * Which identifier collided during a create or update, so the caller can route
 * the operation to the duplicate-merge workflow rather than silently failing.
 */
export type PatientIdentifierConflict = {
  field: 'nik' | 'bpjsNumber';
  patientId: string;
};

/**
 * How far a patient permission reaches: `ANY` covers every record, `OWN` only
 * the rows the actor is connected to. Mirrors the permission `scope` column.
 */
export type PatientScopeMode = 'ANY' | 'OWN';

/**
 * What "own" means for a given action. `CARE` is the clinical read boundary —
 * the owning user or an actively assigned doctor. `SELF` is strictly the
 * owning user, used where a treating doctor has no business: identifier
 * unmasking, demographic updates, privacy-notice history.
 */
export type PatientOwnershipMode = 'CARE' | 'SELF';

/**
 * Actor context every scoped patient repository query requires. Repositories
 * never receive raw user IDs ad hoc — the scope travels with the identity so
 * ownership is enforced inside the SQL `where`, not by post-fetch filtering
 * (SJ-2).
 */
export type PatientScopeActor = {
  userId: string;
  scope: PatientScopeMode;
};

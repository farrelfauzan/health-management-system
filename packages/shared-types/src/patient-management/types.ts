import type {
  AllergySeverityValue,
  BloodTypeValue,
  MaritalStatusValue,
  PatientAllergyInput,
  PatientSexValue,
  PatientStatusValue,
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
  createdFrom?: Date;
  createdTo?: Date;
};

export type CreatePatientRecordPayload = {
  mrn: string;
  fullName: string;
  dateOfBirth: Date;
  placeOfBirth?: string;
  sex: PatientSexValue;
  status: PatientStatusValue;
  phoneNumber: string;
  address: string;
  nik?: string;
  bpjsNumber?: string;
  ownerUserId?: string;
  isActive: boolean;
  doctorIds?: string[];
  allergies?: PatientAllergyInput[];
  actorUserId: string;
} & PatientDemographicFields;

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
  dateOfBirth: Date;
  placeOfBirth: string | null;
  sex: PatientSexValue | null;
  status: PatientStatusValue;
  phoneNumber: string;
  address: string;
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
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Which identifier collided during a create or update, so the caller can route
 * the operation to the duplicate-merge workflow rather than silently failing.
 */
export type PatientIdentifierConflict = {
  field: 'nik' | 'bpjsNumber';
  patientId: string;
};

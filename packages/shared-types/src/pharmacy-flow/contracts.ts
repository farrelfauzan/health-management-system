import type {
  DispenseStatusValue,
  MedicationCategoryValue,
  MedicationUnitValue,
  PrescriptionStatusValue,
} from '#pharmacy-flow/schemas';

export type MedicationResponse = {
  id: string;
  code: string;
  kfaCode?: string;
  name: string;
  form?: string;
  strength?: string;
  unit?: MedicationUnitValue;
  category?: MedicationCategoryValue;
  stockQty: number;
  createdAt: string;
  updatedAt: string;
};

export type MedicationsListMeta = {
  page: number;
  limit: number;
  total: number;
};

export type PrescriptionsListMeta = {
  page: number;
  limit: number;
  total: number;
};

export type PrescriptionRelatedPatient = {
  id: string;
  mrn: string;
  fullName: string;
};

export type PrescriptionRelatedDoctor = {
  id: string;
  licenseNumber: string;
  fullName: string;
};

export type PrescriptionItemResponse = {
  id: string;
  medicationId: string;
  medicationCode: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  durationDays?: number;
  quantity: number;
  instructions?: string;
};

export type PrescriptionResponse = {
  id: string;
  patientId: string;
  doctorId: string;
  encounterId?: string;
  status: PrescriptionStatusValue;
  issuedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  patient: PrescriptionRelatedPatient;
  doctor: PrescriptionRelatedDoctor;
  items: PrescriptionItemResponse[];
};

export type DispenseItemResponse = {
  id: string;
  medicationId: string;
  medicationCode: string;
  medicationName: string;
  quantity: number;
};

export type DispenseRecordResponse = {
  id: string;
  prescriptionId: string;
  prescriptionStatus: PrescriptionStatusValue;
  pharmacistId: string;
  status: DispenseStatusValue;
  dispensedAt: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  items: DispenseItemResponse[];
};

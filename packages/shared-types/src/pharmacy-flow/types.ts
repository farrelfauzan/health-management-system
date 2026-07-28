import type {
  DispenseStatusValue,
  MedicationCategoryValue,
  MedicationUnitValue,
  PrescriptionStatusValue,
} from '#pharmacy-flow/schemas';

export type ListMedicationsParams = {
  page: number;
  limit: number;
  search?: string;
  category?: MedicationCategoryValue;
};

export type ListPrescriptionsParams = {
  page: number;
  limit: number;
  status?: PrescriptionStatusValue;
  patientId?: string;
  doctorId?: string;
  encounterId?: string;
  ownerUserId?: string;
};

export type MedicationRecord = {
  id: string;
  code: string;
  kfaCode: string | null;
  name: string;
  form: string | null;
  strength: string | null;
  unit: MedicationUnitValue | null;
  category: MedicationCategoryValue | null;
  stockQty: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateMedicationRecordPayload = {
  code: string;
  kfaCode?: string;
  name: string;
  form?: string;
  strength?: string;
  unit?: MedicationUnitValue;
  category?: MedicationCategoryValue;
  stockQty: number;
};

export type UpdateMedicationRecordPayload = {
  code?: string;
  kfaCode?: string | null;
  name?: string;
  form?: string | null;
  strength?: string | null;
  unit?: MedicationUnitValue | null;
  category?: MedicationCategoryValue | null;
  stockQty?: number;
};

export type MedicationStockRecord = {
  id: string;
  code: string;
  name: string;
  stockQty: number;
};

export type PrescriptionPatientProjection = {
  id: string;
  mrn: string;
  fullName: string;
  ownerUserId: string | null;
};

export type PrescriptionDoctorProjection = {
  id: string;
  licenseNumber: string;
  fullName: string;
  ownerUserId: string | null;
};

export type PrescriptionItemMedicationProjection = {
  id: string;
  code: string;
  name: string;
};

export type PrescriptionItemRecord = {
  id: string;
  medicationId: string;
  dosage: string;
  frequency: string;
  durationDays: number | null;
  quantity: number;
  instructions: string | null;
  medication: PrescriptionItemMedicationProjection;
};

export type PrescriptionDispenseItemProjection = {
  medicationId: string;
  quantity: number;
};

export type PrescriptionDispenseRecordProjection = {
  id: string;
  status: DispenseStatusValue;
  items: PrescriptionDispenseItemProjection[];
};

export type PrescriptionDetailRecord = {
  id: string;
  patientId: string;
  doctorId: string;
  encounterId: string | null;
  status: PrescriptionStatusValue;
  issuedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  patient: PrescriptionPatientProjection;
  doctor: PrescriptionDoctorProjection;
  items: PrescriptionItemRecord[];
  dispenseRecords: PrescriptionDispenseRecordProjection[];
};

export type CreatePrescriptionItemPayload = {
  medicationId: string;
  dosage: string;
  frequency: string;
  durationDays?: number;
  quantity: number;
  instructions?: string;
};

export type CreatePrescriptionRecordPayload = {
  patientId: string;
  doctorId: string;
  encounterId?: string;
  notes?: string;
  items: CreatePrescriptionItemPayload[];
};

export type CreateDispenseItemPayload = {
  medicationId: string;
  quantity: number;
};

export type CreateDispenseRecordPayload = {
  prescriptionId: string;
  pharmacistId: string;
  notes?: string;
  items: CreateDispenseItemPayload[];
};

export type DispenseItemWithMedicationRecord = {
  id: string;
  medicationId: string;
  quantity: number;
  medication: PrescriptionItemMedicationProjection;
};

export type DispenseRecordDetailRecord = {
  id: string;
  prescriptionId: string;
  pharmacistId: string;
  status: DispenseStatusValue;
  dispensedAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: DispenseItemWithMedicationRecord[];
  prescription: {
    status: PrescriptionStatusValue;
  };
};

export type ActiveDoctorProjection = {
  id: string;
  ownerUserId: string | null;
};

export type ActivePatientProjection = {
  id: string;
  ownerUserId: string | null;
};

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
  dphoCode?: string;
  name: string;
  form?: string;
  strength?: string;
  unit?: MedicationUnitValue;
  category?: MedicationCategoryValue;
  stockQty: number;
  reorderLevel: number;
  needsReorder: boolean;
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
  allocations: DispenseItemStockAllocationResponse[];
};

export type DispenseItemStockAllocationResponse = {
  stockReceiptId: string;
  batchNumber: string;
  expiryDate?: string;
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

export type StockReceiptResponse = {
  id: string;
  medicationId: string;
  medicationCode: string;
  medicationName: string;
  batchNumber: string;
  expiryDate?: string;
  quantity: number;
  allocatedQty: number;
  remainingQty: number;
  receivedAt: string;
  receivedById?: string;
  notes?: string;
  createdAt: string;
};

export type InventorySummaryItemResponse = {
  medicationId: string;
  medicationCode: string;
  medicationName: string;
  stockQty: number;
  reorderLevel: number;
  needsReorder: boolean;
  nearestExpiryDate?: string;
  unknownExpiryQty: number;
};

export type InventorySummaryResponse = {
  asOfDate: string;
  medicationCount: number;
  totalStockQty: number;
  reorderCount: number;
  items: InventorySummaryItemResponse[];
};

export type ExpiryReportItemResponse = StockReceiptResponse & {
  expiryStatus: 'EXPIRED' | 'EXPIRING' | 'UNKNOWN';
  daysUntilExpiry?: number;
};

export type ExpiryReportResponse = {
  asOfDate: string;
  throughDate: string;
  items: ExpiryReportItemResponse[];
};

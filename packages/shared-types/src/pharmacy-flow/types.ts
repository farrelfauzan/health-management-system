import type {
  CompoundPreparationValue,
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
  reorderOnly?: boolean;
  inventoryDate: Date;
};

export type ListPrescriptionsParams = {
  page: number;
  limit: number;
  status?: PrescriptionStatusValue;
  patientId?: string;
  doctorId?: string;
  encounterId?: string;
};

/**
 * How far a prescription permission reaches: `ANY` covers every record, `OWN`
 * only the rows the actor participates in. Mirrors the permission `scope`
 * column.
 */
export type PrescriptionScopeMode = 'ANY' | 'OWN';

/**
 * Actor context every scoped prescription repository query requires (SJ-2).
 * Ownership is participant-side — the owning user of the patient or the
 * doctor on the row — and mandatory: an optional owner param would make
 * "forgot to pass it" silently unscoped.
 */
export type PrescriptionScopeActor = {
  userId: string;
  scope: PrescriptionScopeMode;
};

export type MedicationRecord = {
  id: string;
  code: string;
  kfaCode: string | null;
  dphoCode: string | null;
  name: string;
  form: string | null;
  strength: string | null;
  unit: MedicationUnitValue | null;
  category: MedicationCategoryValue | null;
  stockQty: number;
  reorderLevel: number;
  isVaccine: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * The minimum another module needs to decide whether a catalog row may be
 * recorded as a vaccination, and whether it will be reportable (P10-T16).
 */
export type VaccineCatalogEntry = {
  id: string;
  name: string;
  kfaCode: string | null;
};

export type CreateMedicationRecordPayload = {
  code: string;
  kfaCode?: string;
  name: string;
  form?: string;
  strength?: string;
  unit?: MedicationUnitValue;
  category?: MedicationCategoryValue;
  reorderLevel: number;
  isVaccine?: boolean;
};

export type UpdateMedicationRecordPayload = {
  code?: string;
  kfaCode?: string | null;
  name?: string;
  form?: string | null;
  strength?: string | null;
  unit?: MedicationUnitValue | null;
  category?: MedicationCategoryValue | null;
  reorderLevel?: number;
  isVaccine?: boolean;
};

export type MedicationStockRecord = {
  id: string;
  code: string;
  name: string;
  stockQty: number;
};

export type CreateStockReceiptRecordPayload = {
  medicationId: string;
  batchNumber: string;
  expiryDate: Date;
  quantity: number;
  receivedAt?: Date;
  receivedById: string;
  notes?: string;
};

export type ListStockReceiptsParams = {
  page: number;
  limit: number;
  medicationId?: string;
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

/**
 * One ingredient of a compound line (P10-T18). `quantity` is a number rather
 * than a Decimal string because the repository converts at the Prisma
 * boundary, as it does for every other decimal in this domain.
 */
export type PrescriptionItemComponentRecord = {
  id: string;
  medicationId: string;
  quantity: number;
  unit: string;
  medication: PrescriptionItemMedicationProjection;
};

/**
 * One prescription line. `medication` is null exactly when `isCompound` is
 * true, which a database CHECK enforces — a reader never has to decide which
 * of the two shapes a line meant.
 */
export type PrescriptionItemRecord = {
  id: string;
  medicationId: string | null;
  dosage: string;
  frequency: string;
  durationDays: number | null;
  quantity: number;
  instructions: string | null;
  isCompound: boolean;
  compoundName: string | null;
  preparation: CompoundPreparationValue | null;
  dosageUnit: string | null;
  medication: PrescriptionItemMedicationProjection | null;
  components: PrescriptionItemComponentRecord[];
};

export type PrescriptionDispenseItemProjection = {
  medicationId: string | null;
  prescriptionItemId: string | null;
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
  medicationId?: string;
  dosage: string;
  frequency: string;
  durationDays?: number;
  quantity: number;
  instructions?: string;
  isCompound?: boolean;
  compoundName?: string;
  preparation?: CompoundPreparationValue;
  dosageUnit?: string;
  components?: Array<{ medicationId: string; quantity: number; unit: string }>;
};

export type CreatePrescriptionRecordPayload = {
  patientId: string;
  doctorId: string;
  encounterId?: string;
  notes?: string;
  items: CreatePrescriptionItemPayload[];
};

/**
 * One line being handed over: a catalog product, or a whole compound named by
 * its prescription line. Exactly one of the two, which the schema refuses to
 * validate otherwise.
 */
export type CreateDispenseItemPayload = {
  medicationId?: string;
  prescriptionItemId?: string;
  quantity: number;
};

export type CreateDispenseRecordPayload = {
  prescriptionId: string;
  pharmacistId: string;
  notes?: string;
  items: CreateDispenseItemPayload[];
  inventoryDate: Date;
};

export type DispenseItemWithMedicationRecord = {
  id: string;
  medicationId: string | null;
  prescriptionItemId: string | null;
  quantity: number;
  medication: PrescriptionItemMedicationProjection | null;
  /** The compound this line handed over, when it is not a product line. */
  prescriptionItem: {
    id: string;
    compoundName: string | null;
    preparation: CompoundPreparationValue | null;
    dosageUnit: string | null;
    components: PrescriptionItemComponentRecord[];
  } | null;
  stockAllocations: Array<{
    quantity: number;
    stockReceipt: { id: string; batchNumber: string; expiryDate: Date | null };
  }>;
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

import type { DoctorAuthorityKindValue } from '#doctor-management/schemas';
import type { ChargeModeValue, FulfilmentSiteValue } from '#laboratory/schemas';
import type {
  CompoundPreparationValue,
  DispenseStatusValue,
  MedicationCategoryValue,
  MedicationUnitValue,
  MidwifeFormularyGroupValue,
  MidwifeFormularyMatchKindValue,
  PrescriptionStatusValue,
} from '#pharmacy-flow/schemas';

/**
 * One product from the KFA dictionary, as the catalog form offers it. The
 * `kfaCode` is what SATUSEHAT validates `Medication.code` against; the rest is
 * what tells a pharmacist they picked the right product — KFA lists the same
 * drug once per manufacturer and pack size.
 */
export type KfaProductResponse = {
  kfaCode: string;
  name: string;
  dosageForm: string | null;
  manufacturer: string | null;
  packagingUnit: string | null;
  isActive: boolean;
  /**
   * The KFA template (92-level) code the product is a manufacturer-specific
   * instance of (P25-T04), or null when KFA carries none. What tells two iron
   * tablets from different manufacturers apart from two different drugs.
   */
  templateKfaCode: string | null;
};

/** One row of the midwife formulary template (P25-T04, FR-FORM-01). */
export type MidwifeFormularyItemResponse = {
  id: string;
  code: string;
  displayName: string;
  group: MidwifeFormularyGroupValue;
  /** P25-T05. The authority an `AUTHORITY_BOUND` row needs; absent otherwise. */
  authorityKind?: DoctorAuthorityKindValue;
  regulationBasis: string;
  kfaCodes: string[];
  kfaTemplateCodes: string[];
  matchKeywords: string[];
  sortOrder: number;
};

/** A catalog row that a template item matched, and how. */
export type MidwifeFormularyMatchResponse = {
  medicationId: string;
  name: string;
  kfaCode: string | null;
  isMidwifePrescribable: boolean;
  /** P25-T05. The authority applying this row would bind the catalog row to. */
  authorityKind: DoctorAuthorityKindValue | null;
  matchedBy: MidwifeFormularyMatchKindValue;
};

export type MidwifeFormularyPreviewItemResponse = {
  item: MidwifeFormularyItemResponse;
  matches: MidwifeFormularyMatchResponse[];
};

/**
 * Whether the preview could ask KFA for the template code behind every
 * unmatched catalog code. `SKIPPED` means only exact codes and keywords were
 * used: the platform is not configured for this deployment or did not answer.
 */
export type MidwifeFormularyTemplateLookupStatus = 'COMPLETED' | 'SKIPPED';

export type MidwifeFormularyPreviewResponse = {
  items: MidwifeFormularyPreviewItemResponse[];
  /** Template items no catalog row matched by code, template or keyword. */
  unmatchedItems: MidwifeFormularyItemResponse[];
  templateLookup: MidwifeFormularyTemplateLookupStatus;
};

export type MidwifeFormularyApplyOutcome = 'FLAGGED' | 'ALREADY_FLAGGED';

export type MidwifeFormularyApplyItemResponse = {
  medicationId: string;
  outcome: MidwifeFormularyApplyOutcome;
};

export type MidwifeFormularyApplyResponse = {
  flaggedCount: number;
  alreadyFlaggedCount: number;
  items: MidwifeFormularyApplyItemResponse[];
};

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
  isVaccine: boolean;
  isMidwifePrescribable: boolean;
  /**
   * P25-T05. The authority a midwife needs to write this item, or absent when
   * it sits inside her own. What the "Perlu kewenangan" badge reads.
   */
  midwifeAuthorityKind?: DoctorAuthorityKindValue;
  /**
   * Selling price per `unit`, in rupiah. Absent until the clinic prices the
   * item; a dispensed unpriced item is reported as a billing gap.
   */
  unitPrice?: number;
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

export type PrescriptionItemComponentResponse = {
  id: string;
  medicationId: string;
  medicationCode: string;
  medicationName: string;
  quantity: number;
  unit: string;
};

/**
 * One prescription line. The product fields are absent exactly when
 * `isCompound` is true — a compound has ingredients instead, and the label
 * carries `compoundName` (P10-T18).
 */
export type PrescriptionItemResponse = {
  id: string;
  medicationId?: string;
  medicationCode?: string;
  medicationName?: string;
  dosage: string;
  frequency: string;
  durationDays?: number;
  quantity: number;
  instructions?: string;
  isCompound: boolean;
  compoundName?: string;
  preparation?: CompoundPreparationValue;
  dosageUnit?: string;
  components: PrescriptionItemComponentResponse[];
};

export type PrescriptionResponse = {
  id: string;
  patientId: string;
  doctorId: string;
  encounterId?: string;
  status: PrescriptionStatusValue;
  /** Where the medicine is bought and who pays for it (P18-T11). */
  fulfilmentSite: FulfilmentSiteValue;
  chargeMode: ChargeModeValue;
  externalFacilityName?: string;
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
  medicationId?: string;
  medicationCode?: string;
  medicationName?: string;
  /** Present on a compound line, absent on a product line. */
  prescriptionItemId?: string;
  compoundName?: string;
  preparation?: CompoundPreparationValue;
  dosageUnit?: string;
  components: PrescriptionItemComponentResponse[];
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
  /**
   * Who handed the medicine over, as a person (P20-T07). The id stays beside
   * it; the name is resolved through the account, so it is never blank.
   */
  pharmacistName: string;
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

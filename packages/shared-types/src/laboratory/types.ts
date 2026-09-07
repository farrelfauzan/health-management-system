import type {
  ChargeModeValue,
  FulfilmentSiteValue,
  LabOrderItemStatusValue,
  LabOrderPriorityValue,
  LabOrderStatusValue,
  LabReferenceRangeInput,
  LabResultTypeValue,
  LabSpecimenRejectReasonValue,
  LabSpecimenStatusValue,
  LabSpecimenTypeValue,
} from '#laboratory/schemas';

/** Repository query parameters for the catalog lists. */
export type ListLabTestsParams = {
  search?: string;
  active?: boolean;
};

export type ListLabPanelsParams = ListLabTestsParams;

export type LabReferenceRangeRecord = {
  id: string;
  sex: 'MALE' | 'FEMALE' | null;
  ageMinDays: number | null;
  ageMaxDays: number | null;
  low: number | null;
  high: number | null;
  criticalLow: number | null;
  criticalHigh: number | null;
  textNormal: string | null;
};

export type LabTestRecord = {
  id: string;
  code: string;
  name: string;
  loincCode: string | null;
  loincDisplay: string | null;
  specimenType: LabSpecimenTypeValue;
  resultType: LabResultTypeValue;
  unit: string | null;
  decimals: number;
  codedOptions: string[];
  isActive: boolean;
  serviceTariffId: string | null;
  price: number | null;
  referenceRanges: LabReferenceRangeRecord[];
  createdAt: Date;
  updatedAt: Date;
};

export type LabPanelMemberRecord = {
  labTestId: string;
  code: string;
  name: string;
  specimenType: LabSpecimenTypeValue;
  resultType: LabResultTypeValue;
  sortOrder: number;
};

export type LabPanelRecord = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  serviceTariffId: string | null;
  price: number | null;
  members: LabPanelMemberRecord[];
  createdAt: Date;
  updatedAt: Date;
};

export type CreateLabTestPayload = {
  code: string;
  name: string;
  loincCode: string | null;
  loincDisplay: string | null;
  specimenType: LabSpecimenTypeValue;
  resultType: LabResultTypeValue;
  unit: string | null;
  decimals: number;
  codedOptions: string[];
  isActive: boolean;
  serviceTariffId: string | null;
};

export type UpdateLabTestPayload = Partial<CreateLabTestPayload> & { id: string };

export type ReplaceLabReferenceRangesPayload = {
  labTestId: string;
  ranges: readonly LabReferenceRangeInput[];
};

export type CreateLabPanelPayload = {
  code: string;
  name: string;
  isActive: boolean;
  serviceTariffId: string | null;
  labTestIds: readonly string[];
};

export type UpdateLabPanelPayload = Partial<Omit<CreateLabPanelPayload, 'labTestIds'>> & {
  id: string;
  labTestIds?: readonly string[];
};

/** Repository query parameters for the lab order list. */
export type ListLabOrdersParams = {
  page: number;
  limit: number;
  orderNumber?: string;
  status?: LabOrderStatusValue;
  patientId?: string;
  orderedFrom?: Date;
  orderedTo?: Date;
};

export type LabOrderItemRecord = {
  id: string;
  labTestId: string;
  code: string;
  name: string;
  specimenType: LabSpecimenTypeValue;
  resultType: LabResultTypeValue;
  status: LabOrderItemStatusValue;
  panelId: string | null;
  panelName: string | null;
  specimenId: string | null;
};

export type LabSpecimenRecord = {
  id: string;
  labOrderId: string;
  specimenType: LabSpecimenTypeValue;
  accessionNumber: string;
  collectedAt: Date;
  collectedById: string;
  receivedAt: Date | null;
  status: LabSpecimenStatusValue;
  rejectedAt: Date | null;
  rejectReason: LabSpecimenRejectReasonValue | null;
  rejectNotes: string | null;
  notes: string | null;
};

export type LabOrderRecord = {
  id: string;
  orderNumber: string;
  encounterId: string;
  patientId: string;
  orderedById: string;
  orderedByName: string;
  status: LabOrderStatusValue;
  priority: LabOrderPriorityValue;
  clinicalNotes: string | null;
  isFasting: boolean;
  fulfilmentSite: FulfilmentSiteValue;
  chargeMode: ChargeModeValue;
  externalFacilityName: string | null;
  recollectCount: number;
  orderedAt: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  releasedAt: Date | null;
  items: LabOrderItemRecord[];
  specimens: LabSpecimenRecord[];
};

export type LabOrderListRecord = Omit<LabOrderRecord, 'items' | 'specimens'> & {
  itemCount: number;
  patientName: string;
  patientMrn: string;
};

/**
 * The encounter facts ordering has to check before it writes anything: the
 * visit must be open, and under OWN scope the caller must be the attending
 * practitioner. `doctorOwnerUserId` is the account behind the DoctorProfile,
 * which is what a JWT subject is compared against.
 */
export type LabOrderEncounterRecord = {
  id: string;
  status: 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';
  patientId: string;
  doctorId: string;
  doctorOwnerUserId: string | null;
  patientOwnerUserId: string | null;
};

/** One already-live item on the same encounter, for the duplicate check. */
export type ExistingEncounterLabItemRecord = {
  labTestId: string;
  orderNumber: string;
};

export type CreateLabOrderItemPayload = {
  labTestId: string;
  panelId: string | null;
};

export type CreateLabOrderPayload = {
  encounterId: string;
  patientId: string;
  orderedById: string;
  priority: LabOrderPriorityValue;
  clinicalNotes: string | null;
  isFasting: boolean;
  fulfilmentSite: FulfilmentSiteValue;
  chargeMode: ChargeModeValue;
  externalFacilityName: string | null;
  orderedAt: Date;
  items: readonly CreateLabOrderItemPayload[];
};

export type CancelLabOrderPayload = {
  id: string;
  cancelledAt: Date;
  cancelReason: string;
};

/**
 * One tube the collection routine decided to draw, before it is written.
 * Carries no accession number: that is allocated inside the write transaction,
 * so a rolled-back draw prints no barcode that later belongs to someone else.
 */
export type CollectLabSpecimenPayload = {
  specimenType: LabSpecimenTypeValue;
  labOrderItemIds: readonly string[];
};

export type CollectLabSpecimensPayload = {
  labOrderId: string;
  collectedAt: Date;
  collectedById: string;
  notes: string | null;
  specimens: readonly CollectLabSpecimenPayload[];
};

export type RejectLabSpecimenPayload = {
  id: string;
  labOrderId: string;
  rejectedAt: Date;
  rejectReason: LabSpecimenRejectReasonValue;
  rejectNotes: string | null;
};

export type LabWorklistPatientRecord = {
  id: string;
  fullName: string;
  mrn: string;
  dateOfBirth: Date;
  sex: 'MALE' | 'FEMALE';
  /** Null when the patient carries no BPJS number — an *umum* payer (P18-T06). */
  bpjsNumberIndex: string | null;
};

export type LabWorklistOrderRecord = Omit<LabOrderRecord, 'items'> & {
  itemCount: number;
  patient: LabWorklistPatientRecord;
  /**
   * The practice licence the request is signed under, printed on the surat
   * pengantar (P18-T12). Read from the doctor's own row rather than typed into
   * a template, so a renewed SIP reaches every future letter without an edit.
   */
  orderedByLicenseNumber: string | null;
};

export type ListLabWorklistParams = {
  statuses: readonly LabOrderStatusValue[];
  orderedFrom?: Date;
  orderedTo?: Date;
};

/** A disposition change, for the audited update route (P18-T11). */
export type UpdateLabOrderDispositionPayload = {
  id: string;
  fulfilmentSite: FulfilmentSiteValue;
  chargeMode: ChargeModeValue;
  externalFacilityName: string | null;
};

/**
 * One priced lab line as billing reads it (P18-T06). Panel members arrive with
 * the panel's own tariff so the group is charged once; a loose test carries
 * its own. A null price is the gap: a test the clinic never priced.
 */
export type BillingLabItemRecord = {
  labOrderId: string;
  orderNumber: string;
  chargeMode: ChargeModeValue;
  labTestId: string;
  testCode: string;
  testName: string;
  testTariffId: string | null;
  testPrice: number | null;
  panelId: string | null;
  panelName: string | null;
  panelTariffId: string | null;
  panelPrice: number | null;
};

/** The single row a daily counter upsert returns. */
export type LabNumberAllocationRow = {
  allocated: number;
};

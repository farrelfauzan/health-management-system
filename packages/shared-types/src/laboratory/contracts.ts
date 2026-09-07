import type {
  ChargeModeValue,
  FulfilmentSiteValue,
  LabOrderItemStatusValue,
  LabOrderPriorityValue,
  LabOrderStatusValue,
  LabResultTypeValue,
  LabSpecimenRejectReasonValue,
  LabSpecimenStatusValue,
  LabSpecimenTypeValue,
} from '#laboratory/schemas';

/**
 * One reference range as the catalog renders it. Numbers rather than decimal
 * strings: the repository converts at the Prisma boundary so no `Decimal`
 * escapes into the domain, the same rule vital signs follow.
 */
export type LabReferenceRangeView = {
  id: string;
  sex?: 'MALE' | 'FEMALE';
  ageMinDays?: number;
  ageMaxDays?: number;
  low?: number;
  high?: number;
  criticalLow?: number;
  criticalHigh?: number;
  textNormal?: string;
};

export type LabTestView = {
  id: string;
  code: string;
  name: string;
  loincCode?: string;
  loincDisplay?: string;
  specimenType: LabSpecimenTypeValue;
  resultType: LabResultTypeValue;
  unit?: string;
  decimals: number;
  codedOptions: string[];
  isActive: boolean;
  serviceTariffId?: string;
  /** Rupiah, from the referenced LAB tariff. Absent when the test is unpriced. */
  price?: number;
  referenceRanges: LabReferenceRangeView[];
  createdAt: string;
  updatedAt: string;
};

/**
 * A panel member as the catalog lists it: enough to show the row and its
 * order, without repeating the member's full ranges — the test's own row
 * carries those.
 */
export type LabPanelMemberView = {
  labTestId: string;
  code: string;
  name: string;
  specimenType: LabSpecimenTypeValue;
  resultType: LabResultTypeValue;
  sortOrder: number;
};

export type LabPanelView = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  serviceTariffId?: string;
  price?: number;
  members: LabPanelMemberView[];
  createdAt: string;
  updatedAt: string;
};

/**
 * One test on an order as every lab screen renders it. The test's identity is
 * denormalised onto the row rather than left as an id, because every consumer
 * — the worklist, the order detail, the label — needs the name and none of
 * them should have to re-read the catalog to get it.
 */
export type LabOrderItemView = {
  id: string;
  labTestId: string;
  code: string;
  name: string;
  specimenType: LabSpecimenTypeValue;
  resultType: LabResultTypeValue;
  status: LabOrderItemStatusValue;
  /** Set when the test was expanded from a panel; absent when ordered loose. */
  panelId?: string;
  panelName?: string;
  /** The tube serving this test, once collected. */
  specimenId?: string;
};

export type LabOrderView = {
  id: string;
  orderNumber: string;
  encounterId: string;
  patientId: string;
  orderedById: string;
  orderedByName: string;
  status: LabOrderStatusValue;
  priority: LabOrderPriorityValue;
  clinicalNotes?: string;
  isFasting: boolean;
  /** Where the work runs and who pays (P18-T11). */
  fulfilmentSite: FulfilmentSiteValue;
  chargeMode: ChargeModeValue;
  externalFacilityName?: string;
  recollectCount: number;
  orderedAt: string;
  cancelledAt?: string;
  cancelReason?: string;
  releasedAt?: string;
  items: LabOrderItemView[];
  specimens: LabSpecimenView[];
};

export type LabOrderListItem = Omit<LabOrderView, 'items' | 'specimens'> & {
  itemCount: number;
  patientName: string;
  patientMrn: string;
};

export type LabOrdersListMeta = {
  page: number;
  limit: number;
  total: number;
};

/**
 * What the encounter record says about its lab work (P18-T02). Deliberately a
 * summary: the visit view needs to show that four tests were asked for and
 * where they got to, and the order's own route carries the rest.
 */
export type LabOrderSummary = {
  id: string;
  orderNumber: string;
  status: LabOrderStatusValue;
  priority: LabOrderPriorityValue;
  itemCount: number;
  orderedAt: string;
};

/**
 * What withdrawing an order left behind on the money side (P18-T06).
 *
 * Cancelling never edits an issued invoice — the laboratory has no business
 * doing that, and an issued bill is corrected by voiding and reissuing. So the
 * response says a manual credit is owed rather than leaving the patient
 * charged for a test nobody ran and nobody mentioned.
 */
export type CancelLabOrderMeta = {
  requiresManualCredit: boolean;
};

export type LabSpecimenView = {
  id: string;
  labOrderId: string;
  specimenType: LabSpecimenTypeValue;
  accessionNumber: string;
  collectedAt: string;
  collectedById: string;
  receivedAt?: string;
  status: LabSpecimenStatusValue;
  rejectedAt?: string;
  rejectReason?: LabSpecimenRejectReasonValue;
  rejectNotes?: string;
  notes?: string;
};

/**
 * One row of the bench's working list.
 *
 * Carries the identity the analis needs to match tube to person and the
 * order's `clinicalNotes` — and nothing else clinical. No SOAP, no diagnoses:
 * a laboratory worklist is not a route into the medical record (P18-T03).
 */
export type LabWorklistItem = {
  id: string;
  orderNumber: string;
  status: LabOrderStatusValue;
  priority: LabOrderPriorityValue;
  isFasting: boolean;
  recollectCount: number;
  orderedAt: string;
  clinicalNotes?: string;
  patient: LabWorklistPatient;
  itemCount: number;
  specimens: LabSpecimenView[];
  /**
   * True when `LAB_REQUIRE_PAYMENT_BEFORE_COLLECTION` is on and this order's
   * visit has not been settled (P18-T06) — the "belum bayar" badge. Always
   * false when the setting is off, so the badge cannot appear in a clinic that
   * does not collect up front.
   */
  isAwaitingPayment: boolean;
};

export type LabWorklistPatient = {
  id: string;
  fullName: string;
  mrn: string;
  dateOfBirth: string;
  sex: 'MALE' | 'FEMALE';
  /** Whole years at the time of the read — what the analis compares a range against. */
  ageYears: number;
};

/**
 * The 50×25 mm label's content, as JSON. The API supplies values, never
 * layout: printing is a browser print of a CSS page (P18-T08), and no printer
 * is integrated.
 */
export type LabSpecimenLabel = {
  accessionNumber: string;
  orderNumber: string;
  specimenType: LabSpecimenTypeValue;
  collectedAt: string;
  patient: LabWorklistPatient;
};

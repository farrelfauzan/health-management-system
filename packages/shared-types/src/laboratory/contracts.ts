import type {
  ChargeModeValue,
  FulfilmentSiteValue,
  LabOrderItemStatusValue,
  LabOrderPriorityValue,
  LabOrderSourceValue,
  LabOrderStatusValue,
  LabReportConfigurationFailureCode,
  LabReportStatusValue,
  LabResultFlagValue,
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
  /** Absent for a request that did not come from a consultation (P18-T10). */
  encounterId?: string;
  /** The visit, which every order has whichever way the request arrived. */
  registrationId: string;
  source: LabOrderSourceValue;
  patientId: string;
  /** Absent when nobody at this clinic ordered it. */
  orderedById?: string;
  orderedByName?: string;
  /** Who asked, when it was a doctor elsewhere (EXTERNAL_REFERRAL only). */
  externalRequesterName?: string;
  externalRequesterFacility?: string;
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

/**
 * One measured value on the wire (P18-T04).
 *
 * The reference band travels with the value rather than being looked up by the
 * client, because the band shown next to a number has to be the one that
 * number was judged against — the catalog's current band may be a different
 * band entirely. `flag` absent means no range applied to this patient's sex and
 * age; the UI says "tidak ada rentang rujukan" and shows the value unjudged.
 */
export type LabResultView = {
  id: string;
  labOrderItemId: string;
  version: number;
  valueNumeric?: number;
  valueText?: string;
  valueCoded?: string;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  refCriticalLow?: number;
  refCriticalHigh?: number;
  refText?: string;
  flag?: LabResultFlagValue;
  /**
   * Who typed the value and who signed it out, as account ids. Ids and not
   * names because a `User` in this system has no display name — the same
   * reason a specimen reports only `collectedById`. A screen that needs to
   * name them resolves the account itself.
   */
  enteredById: string;
  enteredAt: string;
  verifiedById?: string;
  verifiedAt?: string;
  /**
   * True when this value was signed out by the person who typed it, under a
   * clinic that has `singleOperator` on. Shown rather than hidden: a reader
   * of the report is entitled to know how many pairs of eyes the number had.
   */
  verifiedUnderSingleOperator: boolean;
  /** Set when this row corrects an earlier one, with the reason it was corrected. */
  amendedFromId?: string;
  amendReason?: string;
};

/** An order with the current version of every value entered against it. */
export type LabOrderResultsView = {
  order: LabOrderView;
  results: LabResultView[];
};

/**
 * One order as the bench works it (P18-T08): the order, the person the tubes
 * belong to in the worklist's own identity shape — name, MRN, sex and age,
 * nothing clinical — and every value typed so far, released or not.
 *
 * Its own read route because nothing else answers "what has been entered on
 * this order": the trend feed is released values only, and the order view
 * carries statuses without numbers. The patient block is what the entry form
 * needs to preview a flag against the right band before the server has
 * snapshotted one.
 */
export type LabOrderBenchView = LabOrderResultsView & {
  patient: LabWorklistPatient;
};

/**
 * One point on a test's trend (P18-T04). Released values only: an unverified
 * number is not a data point, and a doctor comparing this month against last
 * must not be shown something nobody has signed.
 */
export type PatientLabResultView = LabResultView & {
  labOrderId: string;
  orderNumber: string;
  testCode: string;
  testName: string;
  resultType: LabResultTypeValue;
  collectedAt?: string;
  releasedAt?: string;
};

/** How this clinic runs its bench (P18-T04). */
export type LaboratorySettingsView = {
  technicianMayVerify: boolean;
  singleOperator: boolean;
  updatedById?: string;
  updatedAt?: string;
};

/**
 * One rendering of the hasil laboratorium (P18-T05). A version per release and
 * per amendment, never overwritten: the sheet a patient was handed on Monday
 * must still be the sheet the record shows on Tuesday, beside the corrected
 * one. `documentId` is the patient clinical file (`LAB_RESULT`) once the
 * render has landed; a `FAILED` row carries `lastError` so the order detail
 * can say why there is no PDF yet.
 */
export type LabReportVersionView = {
  id: string;
  labOrderId: string;
  version: number;
  status: LabReportStatusValue;
  /** True when this version was produced by a correction rather than the release. */
  isAmended: boolean;
  /** The order's release time this version reports — its `documentDate`. */
  releasedAt: string;
  documentId?: string;
  attemptCount: number;
  nextAttemptAt?: string;
  lastError?: string;
  /**
   * Set on a FAILED version whose last failure was a missing setting rather
   * than a transient fault (P18-T16) — the screen links it to the setting.
   */
  configurationFailure?: LabReportConfigurationFailureCode;
  renderedAt?: string;
  pageCount?: number;
  requestedById: string;
  /** The verifier's interpretive note printed under this version's results (P18-T14). */
  note?: string;
  createdAt: string;
};

/**
 * The report versions of one order, newest first. `current` is the latest
 * `READY` one — what "the report" means to a download — and is absent while
 * the first render is still queued or has failed.
 */
export type LabReportView = {
  labOrderId: string;
  current?: LabReportVersionView;
  versions: LabReportVersionView[];
};

/** A short-lived signed URL for the current report PDF. */
export type LabReportDownloadView = {
  documentId: string;
  version: number;
  isAmended: boolean;
  renderedAt: string;
  fileName: string;
  url: string;
  expiresAt: string;
};

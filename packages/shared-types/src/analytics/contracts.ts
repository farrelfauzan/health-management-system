import type { AnalyticsPayerTypeValue } from '#analytics/schemas';
import type { InvoiceItemTypeValue, PaymentMethodValue } from '#billing/schemas';
import type { MedicationUnitValue } from '#pharmacy-flow/schemas';

/** How a dashboard's time series is bucketed (PRD FR-FDN-04). */
export type AnalyticsGranularity = 'day' | 'week' | 'month';

/**
 * A clinical or demographic count too small to show (1–4 by default, PRD
 * FR-FDN-05). The number is withheld, not rounded: a "<5" that could be
 * recovered by subtraction would be no protection at all.
 */
export type AnalyticsSuppressedCount = {
  suppressed: true;
};

export type AnalyticsCount = number | AnalyticsSuppressedCount;

/**
 * The filter's comparison period: its totals, and its series so a chart can
 * draw last month's line under this month's. Its buckets start at the
 * comparison period's own dates; a chart pairs them by position.
 */
export type AnalyticsComparison<TTotals, TSeries> = {
  from: string;
  to: string;
  totals: TTotals;
  series: TSeries;
};

/**
 * What every dashboard answers (PRD FR-FDN-06): headline totals, the time
 * series, the breakdowns, and the comparison period's totals when asked.
 * Each dashboard names its own shapes.
 */
export type AnalyticsDashboardData<TTotals, TSeries, TBreakdowns> = {
  totals: TTotals;
  series: TSeries;
  breakdowns: TBreakdowns;
  comparison?: AnalyticsComparison<TTotals, TSeries>;
};

/**
 * `generatedAt` is the instant the figures were read, shown as "Data per …"
 * (NFR-AN-04). A cached answer keeps the instant it was first read.
 */
export type AnalyticsResponseMeta = {
  from: string;
  to: string;
  timezone: string;
  granularity: AnalyticsGranularity;
  generatedAt: string;
};

export type AnalyticsResponse<TData> = {
  data: TData;
  meta: AnalyticsResponseMeta;
};

/** `Registration.type`, the three kinds of visit (PRD FR-OPS-01). */
export type AnalyticsVisitType = 'CONSULTATION' | 'LAB_ONLY' | 'ADMISSION';

/**
 * Where a visit came from (PRD FR-OPS-05): booked by staff, over WhatsApp or
 * Telegram, through Mobile JKN, or a walk-in with no appointment at all.
 */
export type AnalyticsBookingChannel = 'WALK_IN' | 'STAFF' | 'WHATSAPP' | 'TELEGRAM' | 'MOBILE_JKN';

/**
 * The operations headline (P29-T04). A visit is a registration checked in or
 * completed; a new patient is one whose first visit ever falls in the
 * period. The no-show rate is NO_SHOW / (COMPLETED + NO_SHOW), `null` when
 * neither happened.
 */
export type AnalyticsOperationsTotals = {
  visits: number;
  newPatients: number;
  returningPatients: number;
  walkIns: number;
  appointments: number;
  completedAppointments: number;
  noShowAppointments: number;
  noShowRatePercent: number | null;
  /**
   * Check-in to the start of the examination, and the examination itself,
   * in whole minutes (PRD FR-OPS-07). Intervals outside 0–8 hours are
   * clock mistakes, not waits: they are left out of the median and p90 and
   * counted in `excluded…`. `null` when no interval qualifies.
   */
  medianWaitMinutes: number | null;
  p90WaitMinutes: number | null;
  excludedWaitIntervals: number;
  medianConsultMinutes: number | null;
  p90ConsultMinutes: number | null;
  excludedConsultIntervals: number;
  /** Booked appointments over capacity, across sessions with a cap (PRD FR-OPS-06). */
  sessionUtilisationPercent: number | null;
  /** `null` when the rooms and inpatient feature is off (PRD FR-OPS-09). */
  inpatient: AnalyticsInpatientTotals | null;
};

/**
 * Inpatient in the range. Length of stay is over the admissions discharged
 * in the range; occupancy is occupied bed-days over every bed times the
 * range's days, clinic-wide even when a clinician is chosen, because beds
 * are shared.
 */
export type AnalyticsInpatientTotals = {
  admissions: number;
  discharges: number;
  averageLengthOfStayDays: number | null;
  bedOccupancyPercent: number | null;
};

/** Check-ins on one local weekday (1 Monday … 7 Sunday) and hour (PRD FR-OPS-08). */
export type AnalyticsBusiestHourCell = {
  weekday: number;
  hour: number;
  checkIns: number;
};

/** Practice sessions in the range with a patient cap, and sessions moved or cancelled. */
export type AnalyticsSessionUtilisation = {
  cappedSessions: number;
  capacity: number;
  bookedAppointments: number;
  movedSessions: number;
  cancelledSessions: number;
};

/** Discharges in the range by how the patient left. */
export type AnalyticsInpatientDisposition = {
  disposition: string;
  discharges: number;
};

/** One bucket of the visit trend; `bucket` is its first local date. */
export type AnalyticsVisitSeriesPoint = {
  bucket: string;
  visits: number;
  consultation: number;
  labOnly: number;
  admission: number;
};

export type AnalyticsVisitsByType = {
  type: AnalyticsVisitType;
  visits: number;
};

/**
 * Visits at one poli. `specialtyId` is null for a visit registered without
 * one. `previousVisits` is the comparison period's count, present only when
 * `compare` is on.
 */
export type AnalyticsVisitsByPoli = {
  specialtyId: string | null;
  specialtyName: string | null;
  visits: number;
  previousVisits?: number;
};

/** Visits seen by one clinician, through `Encounter.doctorId`. */
export type AnalyticsVisitsByDoctor = {
  doctorId: string;
  doctorName: string;
  visits: number;
  previousVisits?: number;
};

export type AnalyticsAppointmentOutcome = {
  status: string;
  appointments: number;
};

/**
 * One booking channel. For walk-ins `bookings` and `completed` both count
 * the visits themselves and the no-show rate is `null`: nobody fails to turn
 * up for a visit they are already at.
 */
export type AnalyticsBookingChannelRow = {
  channel: AnalyticsBookingChannel;
  bookings: number;
  completed: number;
  noShows: number;
  noShowRatePercent: number | null;
};

export type AnalyticsOperationsBreakdowns = {
  visitsByType: AnalyticsVisitsByType[];
  visitsByPoli: AnalyticsVisitsByPoli[];
  visitsByDoctor: AnalyticsVisitsByDoctor[];
  appointmentOutcomes: AnalyticsAppointmentOutcome[];
  bookingChannels: AnalyticsBookingChannelRow[];
  busiestHours: AnalyticsBusiestHourCell[];
  sessions: AnalyticsSessionUtilisation;
  /** `null` when the rooms and inpatient feature is off. */
  inpatientDispositions: AnalyticsInpatientDisposition[] | null;
};

/**
 * The operations dashboard (P29-T04, PRD FR-OPS-01 to 05). Counts only: no
 * patient appears in it, by identifier or otherwise.
 */
export type AnalyticsOperationsData = AnalyticsDashboardData<
  AnalyticsOperationsTotals,
  AnalyticsVisitSeriesPoint[],
  AnalyticsOperationsBreakdowns
>;

/**
 * One kind of SATUSEHAT submission (P29-T06, PRD FR-INT-01). `submitted`
 * counts what reached SATUSEHAT in the range; `pending` and `failed` are
 * what is outstanding now, whatever the range, because a failure from last
 * month still needs fixing this month. Counts only: the failure text stays
 * in the submission list, since it can carry patient detail.
 */
export type AnalyticsSatusehatKindRow = {
  kind: string;
  submitted: number;
  pending: number;
  failed: number;
  oldestPendingAt: string | null;
};

/** One BPJS submission type (PRD FR-INT-02), on the same rule as SATUSEHAT. */
export type AnalyticsBpjsTypeRow = {
  type: string;
  submitted: number;
  pending: number;
  failed: number;
};

/**
 * Finished visits in the range that cannot be reported yet: no primary
 * diagnosis, or a clinician without a NIK (SATUSEHAT finds practitioners by
 * NIK).
 */
export type AnalyticsReportingReadiness = {
  encountersWithoutPrimaryDiagnosis: number;
  encountersWithUnlinkedClinician: number;
};

/**
 * The reporting status page (P29-T06). `bpjs` is `null` when neither BPJS
 * feature is on, so the page leaves the block out instead of showing zeros
 * for an integration the clinic does not use.
 */
export type AnalyticsReportingHealthData = {
  satusehat: AnalyticsSatusehatKindRow[];
  bpjs: AnalyticsBpjsTypeRow[] | null;
  readiness: AnalyticsReportingReadiness;
};

/**
 * The finance headline (P29-T08, PRD FR-FIN-01 to 06). Revenue follows the
 * **invoice date** (Q-3, answered 2026-09-28): an invoice counts in the
 * period its `issuedAt` falls in, paid or still open. Drafts and voided
 * invoices never count. Prices are tax-inclusive, so `taxAmount` is the PPN
 * inside `revenue`, never added to it.
 *
 * `cashReceived` is the other clock: payments by their `paidAt`. It is the
 * figure the daily cashier report shows, so the two can be reconciled. All
 * amounts are rupiah, summed in integer cents.
 */
export type AnalyticsFinanceTotals = {
  revenue: number;
  taxAmount: number;
  invoices: number;
  /** Visits with an invoice issued in the period; a bill with no visit counts once. */
  invoicedVisits: number;
  /** `revenue / invoicedVisits`, rounded to the rupiah; `null` with no invoice. */
  revenuePerVisit: number | null;
  /** Invoices issued in the period that are still unpaid. */
  unpaidInvoices: number;
  unpaidAmount: number;
  cashReceived: number;
  payments: number;
  /** Invoices voided in the period after they were issued; a voided draft billed nobody. */
  voidedInvoices: number;
  voidedAmount: number;
};

/** One bucket of the finance trend; `bucket` is its first local date. */
export type AnalyticsFinanceSeriesPoint = {
  bucket: string;
  revenue: number;
  cashReceived: number;
};

/** Payments received in the period by method: the cashier report's split. */
export type AnalyticsRevenueByPaymentMethod = {
  method: PaymentMethodValue;
  payments: number;
  amount: number;
};

/** Invoice lines of the period's invoices by what they charge for; `taxAmount` is inside `amount`. */
export type AnalyticsRevenueByItemType = {
  itemType: InvoiceItemTypeValue;
  lines: number;
  amount: number;
  taxAmount: number;
};

/**
 * Revenue credited to a clinician the way the cashier report does: through
 * the invoice's encounter. A walk-in lab bill or an inpatient bill has no
 * encounter and lands on `doctorId: null`, the unattributed row.
 */
export type AnalyticsRevenueByDoctor = {
  doctorId: string | null;
  doctorName: string | null;
  specialtyName: string | null;
  invoices: number;
  visits: number;
  revenue: number;
  revenuePerVisit: number | null;
  previousRevenue?: number;
};

/** Revenue at one poli, through the visit the invoice bills. */
export type AnalyticsRevenueByPoli = {
  specialtyId: string | null;
  specialtyName: string | null;
  invoices: number;
  revenue: number;
  previousRevenue?: number;
};

/**
 * Visits and revenue by who pays (P29-T07). `payerType: null` is a visit
 * whose payer was never recorded, shown as "Tidak tercatat", never guessed.
 */
export type AnalyticsRevenueByPayer = {
  payerType: AnalyticsPayerTypeValue | null;
  visits: number;
  invoices: number;
  revenue: number;
};

export type AnalyticsOutstandingAgeBucket = '0-7' | '8-30' | 'over-30';

export type AnalyticsOutstandingAge = {
  bucket: AnalyticsOutstandingAgeBucket;
  invoices: number;
  amount: number;
};

/**
 * Invoices issued and not yet paid, now, whatever the period: a bill from
 * last month is still owed this month. Age counts clinic days since issue.
 */
export type AnalyticsOutstandingInvoices = {
  invoices: number;
  amount: number;
  aging: AnalyticsOutstandingAge[];
};

export type AnalyticsFinanceBreakdowns = {
  paymentMethods: AnalyticsRevenueByPaymentMethod[];
  itemTypes: AnalyticsRevenueByItemType[];
  doctors: AnalyticsRevenueByDoctor[];
  poli: AnalyticsRevenueByPoli[];
  payers: AnalyticsRevenueByPayer[];
  outstanding: AnalyticsOutstandingInvoices;
};

/** The finance dashboard (P29-T08). Amounts only: no patient or invoice number appears in it. */
export type AnalyticsFinanceData = AnalyticsDashboardData<
  AnalyticsFinanceTotals,
  AnalyticsFinanceSeriesPoint[],
  AnalyticsFinanceBreakdowns
>;

/** One cell of an exported table: text, a number a spreadsheet can sum, or empty. */
export type AnalyticsExportCell = string | number | null;

/**
 * One table of a dashboard's CSV export (P29-T10): the same aggregate the
 * screen shows, under its own title. No row names a patient.
 */
export type AnalyticsExportTable = {
  key: string;
  title: string;
  columns: string[];
  rows: AnalyticsExportCell[][];
};

/**
 * The case-mix headline (P29-T12, PRD FR-CLN-01 to 04). A finished encounter
 * is coded when its primary diagnosis carries an ICD-10 code; completeness is
 * coded over finished. Totals are exact: suppression applies to breakdowns,
 * where a small count could point at a patient (Q-1, 2026-09-30).
 */
export type AnalyticsCaseMixTotals = {
  finishedEncounters: number;
  codedEncounters: number;
  uncodedEncounters: number;
  codingCompletenessPercent: number | null;
  distinctCodes: number;
};

/** Finished and coded encounters in one bucket; `bucket` is its first local date. */
export type AnalyticsCaseMixSeriesPoint = {
  bucket: string;
  finishedEncounters: number;
  codedEncounters: number;
};

/**
 * One row of a ranked clinical list. `CODE` is a single code; `OTHER` gathers
 * every code below the top ten (`otherCodes` says how many), so the list
 * always adds up to the total and a withheld count cannot be recovered by
 * subtraction; `UNCODED` is finished encounters with no coded primary
 * diagnosis. `sharePercent` is over finished encounters, `null` when the
 * count is withheld.
 */
export type AnalyticsCaseMixRowKind = 'CODE' | 'OTHER' | 'UNCODED';

export type AnalyticsCaseMixDiagnosis = {
  kind: AnalyticsCaseMixRowKind;
  code: string | null;
  name: string | null;
  otherCodes?: number;
  count: AnalyticsCount;
  sharePercent: number | null;
};

/** Encounters by ICD-10 group, the first letter of the primary diagnosis's code. */
export type AnalyticsCaseMixGroup = {
  kind: AnalyticsCaseMixRowKind;
  group: string | null;
  otherGroups?: number;
  count: AnalyticsCount;
  sharePercent: number | null;
};

/** Procedures (ICD-9-CM) on the period's finished encounters. */
export type AnalyticsCaseMixProcedure = {
  kind: Exclude<AnalyticsCaseMixRowKind, 'UNCODED'>;
  code: string | null;
  name: string | null;
  otherCodes?: number;
  count: AnalyticsCount;
};

/** Coding completeness at one poli: finished encounters, and how many are not coded yet. */
export type AnalyticsCaseMixPoliCoding = {
  specialtyId: string | null;
  specialtyName: string | null;
  finishedEncounters: number;
  uncodedEncounters: AnalyticsCount;
  codingCompletenessPercent: number | null;
};

export type AnalyticsCaseMixBreakdowns = {
  topDiagnoses: AnalyticsCaseMixDiagnosis[];
  groups: AnalyticsCaseMixGroup[];
  codingByPoli: AnalyticsCaseMixPoliCoding[];
  topProcedures: AnalyticsCaseMixProcedure[];
};

/**
 * The case-mix dashboard (P29-T12). Aggregates only: no patient and no
 * encounter id appears in it, and every clinical breakdown is suppressed.
 */
export type AnalyticsCaseMixData = AnalyticsDashboardData<
  AnalyticsCaseMixTotals,
  AnalyticsCaseMixSeriesPoint[],
  AnalyticsCaseMixBreakdowns
>;

/**
 * The pharmacy headline (P29-T13, PRD FR-PHR-01 and 04). A prescription
 * counts in the period it was issued, under the status it has now, so the
 * five outcomes add up to `prescriptionsIssued`. `filledElsewhere` is an
 * issued prescription the patient was sent to buy at an outside apotek: it
 * will never be dispensed here, so `fullyDispensedPercent` leaves it out.
 * `medianDispenseMinutes` runs from issue to the first dispense that was not
 * cancelled. `medicationRevenue` is in rupiah: the `MEDICATION` lines of
 * issued and paid invoices, by invoice date (Q-3), the same figure the
 * finance dashboard shows for medication.
 */
export type AnalyticsPharmacyTotals = {
  prescriptionsIssued: number;
  fullyDispensed: number;
  partiallyDispensed: number;
  cancelled: number;
  awaitingDispense: number;
  filledElsewhere: number;
  fullyDispensedPercent: number | null;
  medianDispenseMinutes: number | null;
  medicationRevenue: number;
};

/** Prescriptions issued and medication revenue in one bucket; `bucket` is its first local date. */
export type AnalyticsPharmacySeriesPoint = {
  bucket: string;
  prescriptionsIssued: number;
  fullyDispensed: number;
  medicationRevenue: number;
};

/**
 * One medication by the units handed over in the range (PRD FR-PHR-02),
 * counted on dispenses that were not cancelled. A compound line has no
 * catalog medication and is not ranked.
 */
export type AnalyticsPharmacyMedication = {
  medicationId: string;
  code: string;
  name: string;
  strength: string | null;
  unit: MedicationUnitValue | null;
  quantity: number;
  dispenses: number;
};

/**
 * A medication at or below its reorder level now (PRD FR-PHR-03), by the
 * rule the stock page uses: stock is what is left of every batch that has
 * not expired. `averageDailyDispensed` is over the last thirty days, clinic
 * wide; `daysOfCover` is stock over it (FR-PHR-05), `null` when nothing was
 * dispensed.
 */
export type AnalyticsPharmacyReorderItem = {
  medicationId: string;
  code: string;
  name: string;
  strength: string | null;
  unit: MedicationUnitValue | null;
  stock: number;
  reorderLevel: number;
  averageDailyDispensed: number;
  daysOfCover: number | null;
};

/** Batches with stock left, by when they expire: already expired, then 0–30, 31–60 and 61–90 days out. */
export type AnalyticsPharmacyExpiryWindow =
  | 'EXPIRED'
  | 'WITHIN_30_DAYS'
  | 'WITHIN_60_DAYS'
  | 'WITHIN_90_DAYS';

export type AnalyticsPharmacyExpiryBucket = {
  window: AnalyticsPharmacyExpiryWindow;
  batches: number;
  units: number;
  medications: number;
};

/**
 * Stock health now, whatever the filter says (PRD FR-PHR-03): stock is
 * clinic wide and has no period. `reorder` is the most urgent fifty, fewest
 * days of cover first; `reorderCount` is all of them. The expiry windows use
 * the expiry report's own rule, so the same batches appear in both.
 */
export type AnalyticsPharmacyStockHealth = {
  asOfDate: string;
  reorderCount: number;
  reorder: AnalyticsPharmacyReorderItem[];
  expiring: AnalyticsPharmacyExpiryBucket[];
};

export type AnalyticsPharmacyBreakdowns = {
  topMedications: AnalyticsPharmacyMedication[];
  stock: AnalyticsPharmacyStockHealth;
};

/**
 * The pharmacy dashboard (P29-T13). Dispensed quantities are units, not
 * patients, so nothing here is suppressed (NFR-AN-03 covers case mix and
 * demographics); no patient or prescription id appears.
 */
export type AnalyticsPharmacyData = AnalyticsDashboardData<
  AnalyticsPharmacyTotals,
  AnalyticsPharmacySeriesPoint[],
  AnalyticsPharmacyBreakdowns
>;

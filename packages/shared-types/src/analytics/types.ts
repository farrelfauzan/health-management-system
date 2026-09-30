import type {
  AnalyticsExportDashboardValue,
  AnalyticsExportQueryInput,
  AnalyticsFilterInput,
  AnalyticsPayerTypeValue,
} from '#analytics/schemas';
import type {
  AnalyticsBpjsTypeRow,
  AnalyticsBusiestHourCell,
  AnalyticsExportCell,
  AnalyticsExportTable,
  AnalyticsGranularity,
  AnalyticsInpatientDisposition,
  AnalyticsLabOrderSource,
  AnalyticsLaboratoryTest,
  AnalyticsOutstandingAgeBucket,
  AnalyticsPracticeDiagnosis,
  AnalyticsPharmacyExpiryWindow,
  AnalyticsPharmacyMedication,
  AnalyticsReportingReadiness,
  AnalyticsResponse,
  AnalyticsResponseMeta,
} from '#analytics/contracts';
import type { InvoiceItemTypeValue, PaymentMethodValue } from '#billing/schemas';
import type { MedicationUnitValue } from '#pharmacy-flow/schemas';

/** Local calendar dates, both ends included. */
export type AnalyticsPeriod = {
  from: string;
  to: string;
};

export type ResolveAnalyticsRangeParams = AnalyticsPeriod & {
  timeZone: string;
};

/**
 * A filter's dates cut into UTC instants in the clinic's time zone.
 * `start` is inclusive and `end` exclusive — the start of the day after `to`
 * — so a query is always `>= start AND < end`.
 */
export type AnalyticsRange = AnalyticsPeriod & {
  start: Date;
  end: Date;
  dayCount: number;
  granularity: AnalyticsGranularity;
  timeZone: string;
};

/** One row of a breakdown before suppression. */
export type AnalyticsCountCell = {
  count: number;
};

export type SuppressSmallCellsParams<TCell extends AnalyticsCountCell> = {
  cells: readonly TCell[];
  threshold?: number;
};

export type ResolvedAnalyticsRanges = {
  range: AnalyticsRange;
  comparisonRange?: AnalyticsRange;
};

/**
 * What an analytics answer is cached under: the dashboard, the filter, and
 * the viewer only for a dashboard scoped to them (`read-practice:own`).
 */
export type AnalyticsCacheKeyParts = {
  dashboard: string;
  filter: Record<string, unknown>;
  viewerId?: string;
};

/** One cached answer: the in-flight or settled load, and when it goes stale. */
export type AnalyticsCacheEntry = {
  expiresAtMs: number;
  value: Promise<unknown>;
};

export type GetOrLoadAnalyticsParams<TValue> = {
  key: AnalyticsCacheKeyParts;
  load: () => Promise<TValue>;
};

/** Options for one read-only analytics transaction. */
export type RunAnalyticsQueryOptions = {
  statementTimeoutMs?: number;
};

export type AnalyticsNoShowCounts = {
  completed: number;
  noShows: number;
};

/**
 * What an analytics repository query needs: the range as UTC instants,
 * written `YYYY-MM-DD HH:MM:SS.mmm` so Postgres compares them to its
 * `timestamp` columns without a session time zone in between, and the
 * narrowing filters.
 */
export type AnalyticsSqlScope = {
  startUtc: string;
  endUtc: string;
  /** The range's local dates, for `date` columns such as a session's day. */
  fromDate: string;
  toDate: string;
  granularity: AnalyticsGranularity;
  timeZone: string;
  doctorId?: string;
  specialtyId?: string;
  /**
   * Narrows the visit figures to one payer (P29-T07). Appointments, sessions
   * and admissions record no payer, so those blocks ignore it.
   */
  payerType?: AnalyticsPayerTypeValue;
};

export type AnalyticsVisitBucketRow = {
  bucket: string;
  type: string;
  visits: number;
};

export type AnalyticsNewAndReturningRow = {
  newPatients: number;
  returningPatients: number;
};

export type AnalyticsPoliRow = {
  specialtyId: string | null;
  specialtyName: string | null;
  visits: number;
};

export type AnalyticsDoctorRow = {
  doctorId: string;
  doctorName: string;
  visits: number;
};

export type AnalyticsOutcomeRow = {
  status: string;
  appointments: number;
};

export type AnalyticsChannelRow = {
  channel: string;
  bookings: number;
  completed: number;
  noShows: number;
};

export type AnalyticsWalkInRow = {
  walkIns: number;
};

/** Wait and consult intervals, as Postgres's percentiles return them. */
export type AnalyticsTimingsRow = {
  medianWaitMinutes: number | null;
  p90WaitMinutes: number | null;
  excludedWaitIntervals: number;
  medianConsultMinutes: number | null;
  p90ConsultMinutes: number | null;
  excludedConsultIntervals: number;
};

/** Session capacity and bookings; the moved and cancelled counts come from the change log. */
export type AnalyticsSessionRow = {
  cappedSessions: number;
  capacity: number;
  bookedAppointments: number;
};

export type AnalyticsSessionChangeRow = {
  movedSessions: number;
  cancelledSessions: number;
};

/** Inpatient counts; occupancy is finished in code, where the range's day count is known. */
export type AnalyticsInpatientRow = {
  admissions: number;
  discharges: number;
  averageLengthOfStayDays: number | null;
  occupiedBedDays: number;
  bedCount: number;
};

/** Everything the operations dashboard reads for one period, as the database returns it. */
export type AnalyticsOperationsSnapshot = {
  visitBuckets: AnalyticsVisitBucketRow[];
  newAndReturning: AnalyticsNewAndReturningRow;
  poli: AnalyticsPoliRow[];
  doctors: AnalyticsDoctorRow[];
  outcomes: AnalyticsOutcomeRow[];
  channels: AnalyticsChannelRow[];
  walkIns: number;
  timings: AnalyticsTimingsRow;
  busiestHours: AnalyticsBusiestHourCell[];
  sessions: AnalyticsSessionRow & AnalyticsSessionChangeRow;
  inpatient: AnalyticsInpatientRow | null;
  inpatientDispositions: AnalyticsInpatientDisposition[] | null;
};

export type ReadOperationsSnapshotParams = {
  scope: AnalyticsSqlScope;
  includeInpatient: boolean;
};

/** One period's snapshot and the period it covers, ready to shape into the response. */
export type AnalyticsOperationsPeriodSnapshot = {
  range: AnalyticsRange;
  snapshot: AnalyticsOperationsSnapshot;
};

export type BuildAnalyticsOperationsDataParams = {
  current: AnalyticsOperationsPeriodSnapshot;
  comparison?: AnalyticsOperationsPeriodSnapshot;
};

/** A SATUSEHAT kind row as the database returns it, before dates become ISO text. */
export type AnalyticsSatusehatKindDbRow = {
  kind: string;
  submitted: number;
  pending: number;
  failed: number;
  oldestPendingAt: Date | null;
};

/** Everything the reporting status page reads, as the database returns it. */
export type AnalyticsReportingHealthSnapshot = {
  satusehat: AnalyticsSatusehatKindDbRow[];
  bpjs: AnalyticsBpjsTypeRow[] | null;
  readiness: AnalyticsReportingReadiness;
};

export type ReadReportingHealthParams = {
  scope: AnalyticsSqlScope;
  includeBpjs: boolean;
};

/** One period of the operations dashboard to read. */
export type ReadOperationsPeriodParams = {
  range: AnalyticsRange;
  filter: AnalyticsFilterInput;
  includeInpatient: boolean;
};

/**
 * Finance rows as the database returns them (P29-T08). Money comes back as
 * whole cents in a float, exact below 2^53, so nothing is summed as a
 * fractional rupiah.
 */
export type AnalyticsRevenueBucketRow = {
  bucket: string;
  invoices: number;
  revenueCents: number;
  taxCents: number;
  unpaidInvoices: number;
  unpaidCents: number;
};

export type AnalyticsCashBucketRow = {
  bucket: string;
  payments: number;
  amountCents: number;
};

export type AnalyticsPaymentMethodRow = {
  method: PaymentMethodValue;
  payments: number;
  amountCents: number;
};

export type AnalyticsItemTypeRow = {
  itemType: InvoiceItemTypeValue;
  lines: number;
  amountCents: number;
  taxCents: number;
};

export type AnalyticsFinanceDoctorRow = {
  doctorId: string | null;
  doctorName: string | null;
  specialtyName: string | null;
  invoices: number;
  visits: number;
  revenueCents: number;
};

export type AnalyticsFinancePoliRow = {
  specialtyId: string | null;
  specialtyName: string | null;
  invoices: number;
  revenueCents: number;
};

export type AnalyticsFinancePayerRow = {
  payerType: AnalyticsPayerTypeValue | null;
  invoices: number;
  revenueCents: number;
};

export type AnalyticsPayerVisitRow = {
  payerType: AnalyticsPayerTypeValue | null;
  visits: number;
};

export type AnalyticsInvoiceCountRow = {
  invoices: number;
  amountCents: number;
};

export type AnalyticsOutstandingAgeRow = {
  bucket: AnalyticsOutstandingAgeBucket;
  invoices: number;
  amountCents: number;
};

export type AnalyticsInvoicedVisitRow = {
  invoicedVisits: number;
};

/** Every finance figure for one period, as read in one transaction. */
export type AnalyticsFinanceSnapshot = {
  revenueBuckets: AnalyticsRevenueBucketRow[];
  cashBuckets: AnalyticsCashBucketRow[];
  paymentMethods: AnalyticsPaymentMethodRow[];
  itemTypes: AnalyticsItemTypeRow[];
  doctors: AnalyticsFinanceDoctorRow[];
  poli: AnalyticsFinancePoliRow[];
  payerRevenue: AnalyticsFinancePayerRow[];
  payerVisits: AnalyticsPayerVisitRow[];
  invoicedVisits: number;
  voids: AnalyticsInvoiceCountRow;
  outstanding: AnalyticsOutstandingAgeRow[];
};

export type AnalyticsFinancePeriodSnapshot = {
  range: AnalyticsRange;
  snapshot: AnalyticsFinanceSnapshot;
};

export type BuildAnalyticsFinanceDataParams = {
  current: AnalyticsFinancePeriodSnapshot;
  comparison?: AnalyticsFinancePeriodSnapshot;
};

/** One period of the finance dashboard to read. */
export type ReadFinancePeriodParams = {
  range: AnalyticsRange;
  filter: AnalyticsFilterInput;
};

/**
 * How one dashboard exports (P29-T10): the tables it can write, each built
 * from the dashboard's own response, and how to read that response. A new
 * dashboard exports by registering one of these; nothing else changes.
 */
export type AnalyticsExportTableSpec<TData> = {
  key: string;
  title: string;
  build: (data: TData) => Pick<AnalyticsExportTable, 'columns' | 'rows'>;
};

export type AnalyticsExportDashboardSpec<TData> = {
  dashboard: AnalyticsExportDashboardValue;
  /** The page title, written at the top of the file. */
  title: string;
  load: (filter: AnalyticsFilterInput) => Promise<AnalyticsResponse<TData>>;
  tables: readonly AnalyticsExportTableSpec<TData>[];
};

/** A finished export: the file's name and its text, BOM included. */
export type AnalyticsExportFile = {
  fileName: string;
  csv: string;
  rowCount: number;
};

export type ExportAnalyticsParams = {
  dashboard: AnalyticsExportDashboardValue;
  query: AnalyticsExportQueryInput;
  actorUserId: string;
};

export type BuildAnalyticsExportCsvParams = {
  dashboardTitle: string;
  meta: AnalyticsResponseMeta;
  filterLines: AnalyticsExportCell[][];
  tables: readonly AnalyticsExportTable[];
};

/** The tables a dashboard's export read, with the period they cover. */
export type AnalyticsExportResult = {
  meta: AnalyticsResponseMeta;
  tables: AnalyticsExportTable[];
};

/**
 * One registered dashboard, its data type erased: its title, the tables it
 * can write, and a function that reads the dashboard and builds the chosen
 * tables. What `AnalyticsExportService` keeps per dashboard.
 */
export type AnalyticsExportRunner = {
  title: string;
  tableKeys: readonly string[];
  run: (
    filter: AnalyticsFilterInput,
    tableKeys: readonly string[],
  ) => Promise<AnalyticsExportResult>;
};

/** Case-mix rows as the database returns them (P29-T12). */
export type AnalyticsCaseMixTotalsRow = {
  finishedEncounters: number;
  codedEncounters: number;
  distinctCodes: number;
};

export type AnalyticsCaseMixBucketRow = {
  bucket: string;
  finishedEncounters: number;
  codedEncounters: number;
};

export type AnalyticsCodeCountRow = {
  code: string;
  name: string | null;
  count: number;
};

export type AnalyticsGroupCountRow = {
  group: string;
  count: number;
};

export type AnalyticsPoliCodingRow = {
  specialtyId: string | null;
  specialtyName: string | null;
  finishedEncounters: number;
  codedEncounters: number;
};

/** Every case-mix figure for one period, as read in one transaction. */
export type AnalyticsCaseMixSnapshot = {
  totals: AnalyticsCaseMixTotalsRow;
  buckets: AnalyticsCaseMixBucketRow[];
  diagnoses: AnalyticsCodeCountRow[];
  groups: AnalyticsGroupCountRow[];
  poli: AnalyticsPoliCodingRow[];
  procedures: AnalyticsCodeCountRow[];
};

export type AnalyticsCaseMixPeriodSnapshot = {
  range: AnalyticsRange;
  snapshot: AnalyticsCaseMixSnapshot;
};

export type BuildAnalyticsCaseMixDataParams = {
  current: AnalyticsCaseMixPeriodSnapshot;
  comparison?: AnalyticsCaseMixPeriodSnapshot;
};

export type ReadCaseMixPeriodParams = {
  range: AnalyticsRange;
  filter: AnalyticsFilterInput;
};

/** Pharmacy rows as the database returns them (P29-T13). */
export type AnalyticsPharmacyTotalsRow = {
  prescriptionsIssued: number;
  fullyDispensed: number;
  partiallyDispensed: number;
  cancelled: number;
  awaitingDispense: number;
  filledElsewhere: number;
  medianDispenseMinutes: number | null;
};

export type AnalyticsPharmacyBucketRow = {
  bucket: string;
  prescriptionsIssued: number;
  fullyDispensed: number;
};

export type AnalyticsMedicationRevenueBucketRow = {
  bucket: string;
  amountCents: number;
};

export type AnalyticsPharmacyMedicationRow = AnalyticsPharmacyMedication;

export type AnalyticsPharmacyReorderRow = {
  medicationId: string;
  code: string;
  name: string;
  strength: string | null;
  unit: MedicationUnitValue | null;
  stock: number;
  reorderLevel: number;
  dispensedLast30Days: number;
};

export type AnalyticsPharmacyExpiryRow = {
  window: AnalyticsPharmacyExpiryWindow;
  batches: number;
  units: number;
  medications: number;
};

/** Every pharmacy figure for one period, as read in one transaction. */
export type AnalyticsPharmacySnapshot = {
  totals: AnalyticsPharmacyTotalsRow;
  buckets: AnalyticsPharmacyBucketRow[];
  revenueBuckets: AnalyticsMedicationRevenueBucketRow[];
  medications: AnalyticsPharmacyMedicationRow[];
};

/** Stock health now, read once whatever the period. */
export type AnalyticsPharmacyStockSnapshot = {
  asOfDate: string;
  reorder: AnalyticsPharmacyReorderRow[];
  expiry: AnalyticsPharmacyExpiryRow[];
};

export type AnalyticsPharmacyPeriodSnapshot = {
  range: AnalyticsRange;
  snapshot: AnalyticsPharmacySnapshot;
};

export type BuildAnalyticsPharmacyDataParams = {
  current: AnalyticsPharmacyPeriodSnapshot;
  comparison?: AnalyticsPharmacyPeriodSnapshot;
  stock: AnalyticsPharmacyStockSnapshot;
};

export type ReadPharmacyPeriodParams = {
  range: AnalyticsRange;
  filter: AnalyticsFilterInput;
};

/** Laboratory rows as the database returns them (P29-T14). */
export type AnalyticsLaboratoryTotalsRow = {
  orders: number;
  released: number;
  inProgress: number;
  sentOut: number;
  cancelled: number;
  recollectedOrders: number;
  medianTurnaroundMinutes: number | null;
  p90TurnaroundMinutes: number | null;
};

export type AnalyticsLaboratoryBucketRow = {
  bucket: string;
  orders: number;
  released: number;
};

export type AnalyticsLaboratorySourceRow = {
  source: AnalyticsLabOrderSource;
  orders: number;
};

export type AnalyticsLaboratoryTestRow = AnalyticsLaboratoryTest;

/** Every laboratory figure for one period, as read in one transaction. */
export type AnalyticsLaboratorySnapshot = {
  totals: AnalyticsLaboratoryTotalsRow;
  buckets: AnalyticsLaboratoryBucketRow[];
  sources: AnalyticsLaboratorySourceRow[];
  tests: AnalyticsLaboratoryTestRow[];
};

export type AnalyticsLaboratoryPeriodSnapshot = {
  range: AnalyticsRange;
  snapshot: AnalyticsLaboratorySnapshot;
};

export type BuildAnalyticsLaboratoryDataParams = {
  current: AnalyticsLaboratoryPeriodSnapshot;
  comparison?: AnalyticsLaboratoryPeriodSnapshot;
};

export type ReadLaboratoryPeriodParams = {
  range: AnalyticsRange;
  filter: AnalyticsFilterInput;
};

/** Practice rows as the database returns them (P29-T15). */
export type AnalyticsPracticeTotalsRow = {
  finishedEncounters: number;
  codedEncounters: number;
  medianConsultMinutes: number | null;
};

export type AnalyticsPracticeBucketRow = {
  bucket: string;
  finishedEncounters: number;
};

export type AnalyticsPracticeAppointmentRow = {
  completedAppointments: number;
  noShowAppointments: number;
};

export type AnalyticsPracticeDiagnosisRow = AnalyticsPracticeDiagnosis;

/** Every practice figure for one period, as read in one transaction. */
export type AnalyticsPracticeSnapshot = {
  totals: AnalyticsPracticeTotalsRow;
  buckets: AnalyticsPracticeBucketRow[];
  appointments: AnalyticsPracticeAppointmentRow;
  sessions: AnalyticsSessionRow;
  diagnoses: AnalyticsPracticeDiagnosisRow[];
};

export type AnalyticsPracticePeriodSnapshot = {
  range: AnalyticsRange;
  snapshot: AnalyticsPracticeSnapshot;
};

export type BuildAnalyticsPracticeDataParams = {
  current: AnalyticsPracticePeriodSnapshot;
  comparison?: AnalyticsPracticePeriodSnapshot;
};

/** A period of one clinician's practice, whose profile the service resolved from the session. */
export type ReadPracticePeriodParams = {
  range: AnalyticsRange;
  doctorId: string;
};

import type { AnalyticsFilterInput } from '#analytics/schemas';
import type {
  AnalyticsBpjsTypeRow,
  AnalyticsBusiestHourCell,
  AnalyticsGranularity,
  AnalyticsInpatientDisposition,
  AnalyticsReportingReadiness,
} from '#analytics/contracts';

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

import {
  computeNoShowRatePercent,
  listAnalyticsBuckets,
  type AnalyticsAppointmentOutcome,
  type AnalyticsBookingChannel,
  type AnalyticsBookingChannelRow,
  type AnalyticsOperationsData,
  type AnalyticsOperationsPeriodSnapshot,
  type AnalyticsOperationsTotals,
  type AnalyticsVisitSeriesPoint,
  type AnalyticsVisitType,
  type AnalyticsVisitsByDoctor,
  type AnalyticsVisitsByPoli,
  type AnalyticsVisitsByType,
  type BuildAnalyticsOperationsDataParams,
} from '@hms/shared-types';

const VISIT_TYPES: readonly AnalyticsVisitType[] = ['CONSULTATION', 'LAB_ONLY', 'ADMISSION'];
const BOOKED_CHANNELS: readonly AnalyticsBookingChannel[] = [
  'STAFF',
  'WHATSAPP',
  'TELEGRAM',
  'MOBILE_JKN',
];
const SERIES_FIELD_BY_TYPE: Readonly<
  Record<AnalyticsVisitType, 'consultation' | 'labOnly' | 'admission'>
> = {
  CONSULTATION: 'consultation',
  LAB_ONLY: 'labOnly',
  ADMISSION: 'admission',
};

function sumVisits(period: AnalyticsOperationsPeriodSnapshot): number {
  return period.snapshot.visitBuckets.reduce((total, row) => total + row.visits, 0);
}

function countOutcome(period: AnalyticsOperationsPeriodSnapshot, status: string): number {
  return period.snapshot.outcomes.find((row) => row.status === status)?.appointments ?? 0;
}

function buildTotals(period: AnalyticsOperationsPeriodSnapshot): AnalyticsOperationsTotals {
  const completed = countOutcome(period, 'COMPLETED');
  const noShows = countOutcome(period, 'NO_SHOW');
  return {
    visits: sumVisits(period),
    newPatients: period.snapshot.newAndReturning.newPatients,
    returningPatients: period.snapshot.newAndReturning.returningPatients,
    walkIns: period.snapshot.walkIns,
    appointments: period.snapshot.outcomes.reduce((total, row) => total + row.appointments, 0),
    completedAppointments: completed,
    noShowAppointments: noShows,
    noShowRatePercent: computeNoShowRatePercent({ completed, noShows }),
  };
}

/** One point per bucket, quiet days included, split by visit type. */
function buildSeries(period: AnalyticsOperationsPeriodSnapshot): AnalyticsVisitSeriesPoint[] {
  const points = new Map<string, AnalyticsVisitSeriesPoint>(
    listAnalyticsBuckets(period.range, period.range.granularity).map((bucket) => [
      bucket,
      { bucket, visits: 0, consultation: 0, labOnly: 0, admission: 0 },
    ]),
  );
  period.snapshot.visitBuckets.forEach((row) => {
    const point = points.get(row.bucket);
    const field = SERIES_FIELD_BY_TYPE[row.type as AnalyticsVisitType];
    if (point && field) {
      point.visits += row.visits;
      point[field] += row.visits;
    }
  });
  return [...points.values()];
}

function buildVisitsByType(period: AnalyticsOperationsPeriodSnapshot): AnalyticsVisitsByType[] {
  return VISIT_TYPES.map((type) => ({
    type,
    visits: period.snapshot.visitBuckets
      .filter((row) => row.type === type)
      .reduce((total, row) => total + row.visits, 0),
  }));
}

/**
 * Current rows with the comparison period's count beside each, plus the rows
 * that only the comparison period had — a poli that went quiet this month
 * still shows, at zero, so its drop is visible.
 */
function mergeWithPrevious<TRow extends { visits: number }>(
  currentRows: readonly TRow[],
  previousRows: readonly TRow[],
  keyOf: (row: TRow) => string | null,
): Array<TRow & { previousVisits: number }> {
  const previousByKey = new Map(previousRows.map((row) => [keyOf(row), row.visits]));
  const currentKeys = new Set(currentRows.map(keyOf));
  return [
    ...currentRows.map((row) => ({ ...row, previousVisits: previousByKey.get(keyOf(row)) ?? 0 })),
    ...previousRows
      .filter((row) => !currentKeys.has(keyOf(row)))
      .map((row) => ({ ...row, visits: 0, previousVisits: row.visits })),
  ];
}

function buildVisitsByPoli(
  current: AnalyticsOperationsPeriodSnapshot,
  comparison?: AnalyticsOperationsPeriodSnapshot,
): AnalyticsVisitsByPoli[] {
  if (!comparison) {
    return current.snapshot.poli.map((row) => ({ ...row }));
  }
  return mergeWithPrevious(
    current.snapshot.poli,
    comparison.snapshot.poli,
    (row) => row.specialtyId,
  );
}

function buildVisitsByDoctor(
  current: AnalyticsOperationsPeriodSnapshot,
  comparison?: AnalyticsOperationsPeriodSnapshot,
): AnalyticsVisitsByDoctor[] {
  if (!comparison) {
    return current.snapshot.doctors.map((row) => ({ ...row }));
  }
  return mergeWithPrevious(
    current.snapshot.doctors,
    comparison.snapshot.doctors,
    (row) => row.doctorId,
  );
}

function buildAppointmentOutcomes(
  period: AnalyticsOperationsPeriodSnapshot,
): AnalyticsAppointmentOutcome[] {
  return [...period.snapshot.outcomes].sort(
    (left, right) => right.appointments - left.appointments,
  );
}

/** Every channel, in a fixed order, zero rows included, so the table does not reshuffle. */
function buildBookingChannels(
  period: AnalyticsOperationsPeriodSnapshot,
): AnalyticsBookingChannelRow[] {
  const walkIn: AnalyticsBookingChannelRow = {
    channel: 'WALK_IN',
    bookings: period.snapshot.walkIns,
    completed: period.snapshot.walkIns,
    noShows: 0,
    noShowRatePercent: null,
  };
  const booked = BOOKED_CHANNELS.map((channel) => {
    const row = period.snapshot.channels.find((candidate) => candidate.channel === channel);
    const completed = row?.completed ?? 0;
    const noShows = row?.noShows ?? 0;
    return {
      channel,
      bookings: row?.bookings ?? 0,
      completed,
      noShows,
      noShowRatePercent: computeNoShowRatePercent({ completed, noShows }),
    };
  });
  return [walkIn, ...booked];
}

/**
 * Shapes the operations snapshots into the response (P29-T04). Pure, so
 * every rule the dashboard shows — what a visit is, how a channel is named,
 * what the no-show rate divides by — is testable without a database.
 */
export function buildAnalyticsOperationsData({
  current,
  comparison,
}: BuildAnalyticsOperationsDataParams): AnalyticsOperationsData {
  const data: AnalyticsOperationsData = {
    totals: buildTotals(current),
    series: buildSeries(current),
    breakdowns: {
      visitsByType: buildVisitsByType(current),
      visitsByPoli: buildVisitsByPoli(current, comparison),
      visitsByDoctor: buildVisitsByDoctor(current, comparison),
      appointmentOutcomes: buildAppointmentOutcomes(current),
      bookingChannels: buildBookingChannels(current),
    },
  };
  if (!comparison) {
    return data;
  }
  return {
    ...data,
    comparison: {
      from: comparison.range.from,
      to: comparison.range.to,
      totals: buildTotals(comparison),
      series: buildSeries(comparison),
    },
  };
}

import {
  computeNoShowRatePercent,
  listAnalyticsBuckets,
  type AnalyticsPracticeData,
  type AnalyticsPracticePeriodSnapshot,
  type AnalyticsPracticeSeriesPoint,
  type AnalyticsPracticeTotals,
  type BuildAnalyticsPracticeDataParams,
} from '@hms/shared-types';

const PERCENT = 100;
const CENTS_PER_RUPIAH = 100;

function toRupiah(cents: number): number {
  return Math.round(cents) / CENTS_PER_RUPIAH;
}

function buildTotals(period: AnalyticsPracticePeriodSnapshot): AnalyticsPracticeTotals {
  const { totals, appointments, sessions, fees } = period.snapshot;
  return {
    finishedEncounters: totals.finishedEncounters,
    medianConsultMinutes:
      totals.medianConsultMinutes === null ? null : Math.round(totals.medianConsultMinutes),
    completedAppointments: appointments.completedAppointments,
    noShowAppointments: appointments.noShowAppointments,
    noShowRatePercent: computeNoShowRatePercent({
      completed: appointments.completedAppointments,
      noShows: appointments.noShowAppointments,
    }),
    sessionCapacity: sessions.capacity,
    bookedAppointments: sessions.bookedAppointments,
    // Whole points, as the tile shows it; a session with no cap has no capacity to fill.
    sessionUtilisationPercent:
      sessions.capacity > 0
        ? Math.round((sessions.bookedAppointments / sessions.capacity) * PERCENT)
        : null,
    grossFee: toRupiah(fees.reduce((total, row) => total + row.grossFeeCents, 0)),
  };
}

function buildSeries(period: AnalyticsPracticePeriodSnapshot): AnalyticsPracticeSeriesPoint[] {
  const byBucket = new Map(period.snapshot.buckets.map((row) => [row.bucket, row]));
  return listAnalyticsBuckets(period.range, period.range.granularity).map((bucket) => ({
    bucket,
    finishedEncounters: byBucket.get(bucket)?.finishedEncounters ?? 0,
  }));
}

/**
 * Shapes one clinician's snapshots into the response (P29-T15, fees P29-T18).
 * Nothing is suppressed: every count is of the clinician's own encounters,
 * and the fee is their own (Q-4).
 */
export function buildAnalyticsPracticeData({
  current,
  comparison,
}: BuildAnalyticsPracticeDataParams): AnalyticsPracticeData {
  const data: AnalyticsPracticeData = {
    totals: buildTotals(current),
    series: buildSeries(current),
    breakdowns: {
      topDiagnoses: current.snapshot.diagnoses,
      codedEncounters: current.snapshot.totals.codedEncounters,
      feesByMonth: current.snapshot.fees.map((row) => ({
        period: row.period,
        grossFee: toRupiah(row.grossFeeCents),
        entries: row.entries,
      })),
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

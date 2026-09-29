import { Injectable } from '@nestjs/common';
import type {
  AnalyticsBusiestHourCell,
  AnalyticsInpatientDisposition,
  AnalyticsInpatientRow,
  AnalyticsSessionChangeRow,
  AnalyticsSessionRow,
  AnalyticsSqlScope,
  AnalyticsTimingsRow,
} from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';
import type { PrismaTransactionClient } from '../../../common/prisma/prisma.types';

// Longer than this between check-in and the examination, or inside it, is
// a clock left running, not a wait (PRD FR-OPS-07).
const MAX_INTERVAL_MINUTES = 8 * 60;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_DAY = 86_400;

/**
 * The operations dashboard's second layer (P29-T11, PRD FR-OPS-06 to 09):
 * wait and consult times, busiest hours, session utilisation and inpatient.
 * Called by `AnalyticsOperationsRepository` inside its read-only
 * transaction, so each method takes the transaction client.
 */
@Injectable()
export class AnalyticsOperationsDepthRepository {
  /** The visit filter of the operations dashboard, for a registration aliased `r`. */
  buildVisitFilter(scope: AnalyticsSqlScope): Prisma.Sql {
    const doctorFilter = scope.doctorId
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM "encounters" fe
          WHERE fe."registration_id" = r."id" AND fe."doctor_id" = ${scope.doctorId}::uuid
            AND fe."deleted_at" IS NULL)`
      : Prisma.empty;
    const poliFilter = scope.specialtyId
      ? Prisma.sql`AND r."specialty_id" = ${scope.specialtyId}::uuid`
      : Prisma.empty;
    return Prisma.sql`r."deleted_at" IS NULL
      AND r."status" IN ('CHECKED_IN', 'COMPLETED')
      AND r."registered_at" >= ${scope.startUtc}::timestamp
      AND r."registered_at" < ${scope.endUtc}::timestamp
      ${doctorFilter} ${poliFilter}`;
  }

  /** Narrows by a doctor column, directly or through the doctor's poli. */
  private buildDoctorColumnFilter(column: Prisma.Sql, scope: AnalyticsSqlScope): Prisma.Sql {
    const doctorFilter = scope.doctorId
      ? Prisma.sql`AND ${column} = ${scope.doctorId}::uuid`
      : Prisma.empty;
    const poliFilter = scope.specialtyId
      ? Prisma.sql`AND ${column} IN (
          SELECT d."id" FROM "doctor_profiles" d WHERE d."specialty_id" = ${scope.specialtyId}::uuid)`
      : Prisma.empty;
    return Prisma.sql`${doctorFilter} ${poliFilter}`;
  }

  /** Median and p90 of check-in → start and start → end, in minutes. */
  async readTimings(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsTimingsRow> {
    const rows = await tx.$queryRaw<AnalyticsTimingsRow[]>`
      WITH intervals AS (
        SELECT extract(epoch FROM (e."started_at" - r."checked_in_at")) / ${SECONDS_PER_MINUTE} AS wait_minutes,
               extract(epoch FROM (e."ended_at" - e."started_at")) / ${SECONDS_PER_MINUTE} AS consult_minutes
        FROM "registrations" r
        JOIN "encounters" e ON e."registration_id" = r."id" AND e."deleted_at" IS NULL
        WHERE ${this.buildVisitFilter(scope)}
      )
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY wait_minutes)
          FILTER (WHERE wait_minutes BETWEEN 0 AND ${MAX_INTERVAL_MINUTES}) AS "medianWaitMinutes",
        percentile_cont(0.9) WITHIN GROUP (ORDER BY wait_minutes)
          FILTER (WHERE wait_minutes BETWEEN 0 AND ${MAX_INTERVAL_MINUTES}) AS "p90WaitMinutes",
        count(*) FILTER (
          WHERE wait_minutes < 0 OR wait_minutes > ${MAX_INTERVAL_MINUTES})::int AS "excludedWaitIntervals",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY consult_minutes)
          FILTER (WHERE consult_minutes BETWEEN 0 AND ${MAX_INTERVAL_MINUTES}) AS "medianConsultMinutes",
        percentile_cont(0.9) WITHIN GROUP (ORDER BY consult_minutes)
          FILTER (WHERE consult_minutes BETWEEN 0 AND ${MAX_INTERVAL_MINUTES}) AS "p90ConsultMinutes",
        count(*) FILTER (
          WHERE consult_minutes < 0 OR consult_minutes > ${MAX_INTERVAL_MINUTES})::int AS "excludedConsultIntervals"
      FROM intervals`;
    return (
      rows[0] ?? {
        medianWaitMinutes: null,
        p90WaitMinutes: null,
        excludedWaitIntervals: 0,
        medianConsultMinutes: null,
        p90ConsultMinutes: null,
        excludedConsultIntervals: 0,
      }
    );
  }

  /** Check-ins by local ISO weekday and hour. */
  listBusiestHours(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsBusiestHourCell[]> {
    return tx.$queryRaw<AnalyticsBusiestHourCell[]>`
      SELECT extract(isodow FROM (r."checked_in_at" AT TIME ZONE 'UTC') AT TIME ZONE ${scope.timeZone})::int AS "weekday",
             extract(hour FROM (r."checked_in_at" AT TIME ZONE 'UTC') AT TIME ZONE ${scope.timeZone})::int AS "hour",
             count(*)::int AS "checkIns"
      FROM "registrations" r
      WHERE ${this.buildVisitFilter(scope)} AND r."checked_in_at" IS NOT NULL
      GROUP BY 1, 2`;
  }

  /**
   * Capacity and bookings over the range's open and closed sessions. A
   * booking is anything but cancelled, rejected or still awaiting approval.
   */
  async readSessions(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsSessionRow> {
    const rows = await tx.$queryRaw<AnalyticsSessionRow[]>`
      SELECT count(*) FILTER (WHERE s."max_patients" IS NOT NULL)::int AS "cappedSessions",
             coalesce(sum(s."max_patients"), 0)::int AS "capacity",
             coalesce(sum(b.booked) FILTER (WHERE s."max_patients" IS NOT NULL), 0)::int AS "bookedAppointments"
      FROM "appointment_sessions" s
      LEFT JOIN LATERAL (
        SELECT count(*) AS booked FROM "appointments" a
        WHERE a."session_id" = s."id" AND a."deleted_at" IS NULL
          AND a."status" NOT IN ('CANCELLED', 'REJECTED', 'REQUESTED')
      ) b ON TRUE
      WHERE s."session_date" >= ${scope.fromDate}::date AND s."session_date" <= ${scope.toDate}::date
        AND s."status" IN ('OPEN', 'CLOSED')
        ${this.buildDoctorColumnFilter(Prisma.sql`s."doctor_id"`, scope)}`;
    return rows[0] ?? { cappedSessions: 0, capacity: 0, bookedAppointments: 0 };
  }

  /** Sessions moved or cancelled in the range, from the change log. */
  async readSessionChanges(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsSessionChangeRow> {
    const rows = await tx.$queryRaw<AnalyticsSessionChangeRow[]>`
      SELECT count(*) FILTER (WHERE c."kind" = 'MOVED')::int AS "movedSessions",
             count(*) FILTER (WHERE c."kind" = 'CANCELLED')::int AS "cancelledSessions"
      FROM "appointment_session_changes" c
      JOIN "appointment_sessions" s ON s."id" = c."session_id"
      WHERE c."occurred_at" >= ${scope.startUtc}::timestamp AND c."occurred_at" < ${scope.endUtc}::timestamp
        ${this.buildDoctorColumnFilter(Prisma.sql`s."doctor_id"`, scope)}`;
    return rows[0] ?? { movedSessions: 0, cancelledSessions: 0 };
  }

  /**
   * Admissions, discharges and length of stay for the range, and the
   * occupied bed-days inside it: each assignment clipped to the range, an
   * open one running to now.
   */
  async readInpatient(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsInpatientRow> {
    const doctorFilter = this.buildDoctorColumnFilter(Prisma.sql`a."admitting_doctor_id"`, scope);
    const rows = await tx.$queryRaw<AnalyticsInpatientRow[]>`
      SELECT
        (SELECT count(*) FROM "admissions" a
          WHERE a."deleted_at" IS NULL AND a."status" <> 'CANCELLED'
            AND a."admitted_at" >= ${scope.startUtc}::timestamp AND a."admitted_at" < ${scope.endUtc}::timestamp
            ${doctorFilter})::int AS "admissions",
        (SELECT count(*) FROM "admissions" a
          WHERE a."deleted_at" IS NULL AND a."status" = 'DISCHARGED'
            AND a."discharged_at" >= ${scope.startUtc}::timestamp AND a."discharged_at" < ${scope.endUtc}::timestamp
            ${doctorFilter})::int AS "discharges",
        (SELECT avg(extract(epoch FROM (a."discharged_at" - a."admitted_at")) / ${SECONDS_PER_DAY})
          FROM "admissions" a
          WHERE a."deleted_at" IS NULL AND a."status" = 'DISCHARGED'
            AND a."discharged_at" >= ${scope.startUtc}::timestamp AND a."discharged_at" < ${scope.endUtc}::timestamp
            ${doctorFilter})::float AS "averageLengthOfStayDays",
        (SELECT coalesce(sum(extract(epoch FROM (
            least(coalesce(ba."ended_at", now() AT TIME ZONE 'UTC'), ${scope.endUtc}::timestamp)
            - greatest(ba."started_at", ${scope.startUtc}::timestamp))) / ${SECONDS_PER_DAY}), 0)
          FROM "bed_assignments" ba
          WHERE ba."started_at" < ${scope.endUtc}::timestamp
            AND coalesce(ba."ended_at", now() AT TIME ZONE 'UTC') > ${scope.startUtc}::timestamp)::float AS "occupiedBedDays",
        (SELECT count(*) FROM "beds" b WHERE b."deleted_at" IS NULL)::int AS "bedCount"`;
    return (
      rows[0] ?? {
        admissions: 0,
        discharges: 0,
        averageLengthOfStayDays: null,
        occupiedBedDays: 0,
        bedCount: 0,
      }
    );
  }

  listInpatientDispositions(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsInpatientDisposition[]> {
    return tx.$queryRaw<AnalyticsInpatientDisposition[]>`
      SELECT coalesce(a."discharge_disposition"::text, 'OTHER') AS "disposition", count(*)::int AS "discharges"
      FROM "admissions" a
      WHERE a."deleted_at" IS NULL AND a."status" = 'DISCHARGED'
        AND a."discharged_at" >= ${scope.startUtc}::timestamp AND a."discharged_at" < ${scope.endUtc}::timestamp
        ${this.buildDoctorColumnFilter(Prisma.sql`a."admitting_doctor_id"`, scope)}
      GROUP BY 1
      ORDER BY "discharges" DESC`;
  }
}

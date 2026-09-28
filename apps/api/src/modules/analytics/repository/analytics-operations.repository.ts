import { Injectable } from '@nestjs/common';
import type {
  AnalyticsChannelRow,
  AnalyticsDoctorRow,
  AnalyticsNewAndReturningRow,
  AnalyticsOperationsSnapshot,
  AnalyticsOutcomeRow,
  AnalyticsPoliRow,
  AnalyticsSqlScope,
  AnalyticsVisitBucketRow,
  AnalyticsWalkInRow,
  ReadOperationsSnapshotParams,
} from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';
import type { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { AnalyticsOperationsDepthRepository } from './analytics-operations-depth.repository';
import { AnalyticsQueryRepository } from './analytics-query.repository';

/**
 * The operations dashboard's reads (P29-T04, PRD FR-OPS-01 to 05), over the
 * registration, encounter and appointment tables (D-049). Aggregates only:
 * no query here selects a patient column other than to count or group it
 * away. Timed against twelve months of fixture data in P29-T03
 * (`docs/post-mvp/analytics-benchmark.md`); re-run that benchmark before
 * changing a join.
 */
@Injectable()
export class AnalyticsOperationsRepository {
  constructor(
    private readonly analyticsQueryRepository: AnalyticsQueryRepository,
    private readonly depthRepository: AnalyticsOperationsDepthRepository,
  ) {}

  /** Every operations figure for one period, in one read-only transaction. */
  readSnapshot({
    scope,
    includeInpatient,
  }: ReadOperationsSnapshotParams): Promise<AnalyticsOperationsSnapshot> {
    return this.analyticsQueryRepository.runReadOnly(async (tx) => ({
      visitBuckets: await this.listVisitBuckets(tx, scope),
      newAndReturning: await this.countNewAndReturning(tx, scope),
      poli: await this.listVisitsByPoli(tx, scope),
      doctors: await this.listVisitsByDoctor(tx, scope),
      outcomes: await this.listAppointmentOutcomes(tx, scope),
      channels: await this.listBookingChannels(tx, scope),
      walkIns: await this.countWalkIns(tx, scope),
      timings: await this.depthRepository.readTimings(tx, scope),
      busiestHours: await this.depthRepository.listBusiestHours(tx, scope),
      sessions: {
        ...(await this.depthRepository.readSessions(tx, scope)),
        ...(await this.depthRepository.readSessionChanges(tx, scope)),
      },
      inpatient: includeInpatient ? await this.depthRepository.readInpatient(tx, scope) : null,
      inpatientDispositions: includeInpatient
        ? await this.depthRepository.listInpatientDispositions(tx, scope)
        : null,
    }));
  }

  /** An appointment scheduled in the range, narrowed by doctor and by the doctor's poli. */
  private buildAppointmentFilter(scope: AnalyticsSqlScope): Prisma.Sql {
    const doctorFilter = scope.doctorId
      ? Prisma.sql`AND a."doctor_id" = ${scope.doctorId}::uuid`
      : Prisma.empty;
    const poliFilter = scope.specialtyId
      ? Prisma.sql`AND a."doctor_id" IN (
          SELECT d."id" FROM "doctor_profiles" d WHERE d."specialty_id" = ${scope.specialtyId}::uuid)`
      : Prisma.empty;
    return Prisma.sql`a."deleted_at" IS NULL
      AND a."scheduled_at" >= ${scope.startUtc}::timestamp
      AND a."scheduled_at" < ${scope.endUtc}::timestamp
      ${doctorFilter} ${poliFilter}`;
  }

  private listVisitBuckets(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsVisitBucketRow[]> {
    return tx.$queryRaw<AnalyticsVisitBucketRow[]>`
      SELECT to_char(
               date_trunc(${scope.granularity}, (r."registered_at" AT TIME ZONE 'UTC') AT TIME ZONE ${scope.timeZone}),
               'YYYY-MM-DD') AS "bucket",
             r."type"::text AS "type",
             count(*)::int AS "visits"
      FROM "registrations" r
      WHERE ${this.depthRepository.buildVisitFilter(scope)}
      GROUP BY 1, 2`;
  }

  /** New = the patient's first visit ever falls in the range (PRD FR-OPS-02). */
  private async countNewAndReturning(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsNewAndReturningRow> {
    const rows = await tx.$queryRaw<AnalyticsNewAndReturningRow[]>`
      WITH period_patients AS (
        SELECT DISTINCT r."patient_id" FROM "registrations" r WHERE ${this.depthRepository.buildVisitFilter(scope)}
      ),
      first_visit AS (
        SELECT v."patient_id", min(v."registered_at") AS first_at
        FROM "registrations" v
        JOIN period_patients p ON p."patient_id" = v."patient_id"
        WHERE v."deleted_at" IS NULL AND v."status" IN ('CHECKED_IN', 'COMPLETED')
        GROUP BY v."patient_id"
      )
      SELECT count(*) FILTER (WHERE first_at >= ${scope.startUtc}::timestamp)::int AS "newPatients",
             count(*) FILTER (WHERE first_at < ${scope.startUtc}::timestamp)::int AS "returningPatients"
      FROM first_visit`;
    return rows[0] ?? { newPatients: 0, returningPatients: 0 };
  }

  private listVisitsByPoli(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsPoliRow[]> {
    return tx.$queryRaw<AnalyticsPoliRow[]>`
      SELECT r."specialty_id"::text AS "specialtyId", s."name" AS "specialtyName",
             count(*)::int AS "visits"
      FROM "registrations" r
      LEFT JOIN "specialties" s ON s."id" = r."specialty_id"
      WHERE ${this.depthRepository.buildVisitFilter(scope)}
      GROUP BY r."specialty_id", s."name"
      ORDER BY "visits" DESC`;
  }

  private listVisitsByDoctor(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsDoctorRow[]> {
    return tx.$queryRaw<AnalyticsDoctorRow[]>`
      SELECT e."doctor_id"::text AS "doctorId", d."full_name" AS "doctorName",
             count(*)::int AS "visits"
      FROM "registrations" r
      JOIN "encounters" e ON e."registration_id" = r."id" AND e."deleted_at" IS NULL
      JOIN "doctor_profiles" d ON d."id" = e."doctor_id"
      WHERE ${this.depthRepository.buildVisitFilter(scope)}
      GROUP BY e."doctor_id", d."full_name"
      ORDER BY "visits" DESC`;
  }

  private listAppointmentOutcomes(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsOutcomeRow[]> {
    return tx.$queryRaw<AnalyticsOutcomeRow[]>`
      SELECT a."status"::text AS "status", count(*)::int AS "appointments"
      FROM "appointments" a
      WHERE ${this.buildAppointmentFilter(scope)}
      GROUP BY a."status"`;
  }

  /** Mobile JKN wins over the chat channel: a JKN booking code means the booking came through BPJS. */
  private listBookingChannels(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsChannelRow[]> {
    return tx.$queryRaw<AnalyticsChannelRow[]>`
      SELECT CASE
               WHEN a."bpjs_booking_code" IS NOT NULL THEN 'MOBILE_JKN'
               WHEN a."booking_source" IS NULL THEN 'STAFF'
               ELSE a."booking_source"::text
             END AS "channel",
             count(*)::int AS "bookings",
             count(*) FILTER (WHERE a."status" = 'COMPLETED')::int AS "completed",
             count(*) FILTER (WHERE a."status" = 'NO_SHOW')::int AS "noShows"
      FROM "appointments" a
      WHERE ${this.buildAppointmentFilter(scope)}
      GROUP BY 1`;
  }

  private async countWalkIns(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<number> {
    const rows = await tx.$queryRaw<AnalyticsWalkInRow[]>`
      SELECT count(*)::int AS "walkIns"
      FROM "registrations" r
      WHERE ${this.depthRepository.buildVisitFilter(scope)} AND r."appointment_id" IS NULL`;
    return rows[0]?.walkIns ?? 0;
  }
}

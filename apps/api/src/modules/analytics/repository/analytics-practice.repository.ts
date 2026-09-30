import { Injectable } from '@nestjs/common';
import type {
  AnalyticsPracticeAppointmentRow,
  AnalyticsPracticeBucketRow,
  AnalyticsPracticeDiagnosisRow,
  AnalyticsPracticeSnapshot,
  AnalyticsPracticeTotalsRow,
  AnalyticsSqlScope,
} from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';
import type { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { AnalyticsOperationsDepthRepository } from './analytics-operations-depth.repository';
import { AnalyticsQueryRepository } from './analytics-query.repository';

// A consultation longer than this is a visit left open, not a consultation
// (the operations dashboard's window).
const MAX_CONSULT_MINUTES = 8 * 60;
// A clinician's most frequent diagnoses (PRD FR-PRC-03).
const TOP_DIAGNOSES = 10;

type ClinicianIdRow = { id: string };

/**
 * The "Praktik saya" reads (P29-T15, PRD FR-PRC-01 to 03), over the
 * encounter, diagnosis, appointment and session tables (D-049). Every query
 * is narrowed to one clinician: `scope.doctorId` is always set, by the
 * service, from the signed-in user's own profile.
 */
@Injectable()
export class AnalyticsPracticeRepository {
  constructor(
    private readonly analyticsQueryRepository: AnalyticsQueryRepository,
    private readonly analyticsOperationsDepthRepository: AnalyticsOperationsDepthRepository,
  ) {}

  /** The clinician profile a user owns, doctor or midwife; `null` when they have none. */
  async findClinicianId(ownerUserId: string): Promise<string | null> {
    const rows = await this.analyticsQueryRepository.runReadOnly(
      (tx) =>
        tx.$queryRaw<ClinicianIdRow[]>`
        SELECT "id"::text AS "id" FROM "doctor_profiles"
        WHERE "owner_user_id" = ${ownerUserId}::uuid AND "deleted_at" IS NULL
        ORDER BY "created_at"
        LIMIT 1`,
    );
    return rows[0]?.id ?? null;
  }

  /** Every figure of one clinician's period, in one read-only transaction. */
  readSnapshot(scope: AnalyticsSqlScope): Promise<AnalyticsPracticeSnapshot> {
    return this.analyticsQueryRepository.runReadOnly(async (tx) => ({
      totals: await this.readTotals(tx, scope),
      buckets: await this.listBuckets(tx, scope),
      appointments: await this.readAppointments(tx, scope),
      sessions: await this.analyticsOperationsDepthRepository.readSessions(tx, scope),
      diagnoses: await this.listDiagnoses(tx, scope),
    }));
  }

  /**
   * The clinician's finished encounters started in the range, each with its
   * consultation length and its primary diagnosis's ICD-10 code, when coded.
   */
  private withFinished(scope: AnalyticsSqlScope): Prisma.Sql {
    return Prisma.sql`WITH finished AS (
      SELECT e."started_at",
             extract(epoch FROM (e."ended_at" - e."started_at")) / 60 AS "consult_minutes",
             c."code", COALESCE(c."display_indonesian", c."display") AS "name"
      FROM "encounters" e
      LEFT JOIN "diagnoses" d
        ON d."encounter_id" = e."id" AND d."type" = 'PRIMARY' AND d."deleted_at" IS NULL
      LEFT JOIN "icd10_codes" c ON c."id" = d."icd10_code_id"
      WHERE e."deleted_at" IS NULL
        AND e."status" = 'FINISHED'
        AND e."doctor_id" = ${scope.doctorId}::uuid
        AND e."started_at" >= ${scope.startUtc}::timestamp
        AND e."started_at" < ${scope.endUtc}::timestamp
    )`;
  }

  private async readTotals(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsPracticeTotalsRow> {
    const rows = await tx.$queryRaw<AnalyticsPracticeTotalsRow[]>`
      ${this.withFinished(scope)}
      SELECT count(*)::int AS "finishedEncounters",
             count("code")::int AS "codedEncounters",
             (percentile_cont(0.5) WITHIN GROUP (ORDER BY "consult_minutes")
               FILTER (WHERE "consult_minutes" BETWEEN 0 AND ${MAX_CONSULT_MINUTES}))::float8
               AS "medianConsultMinutes"
      FROM finished`;
    return rows[0] ?? { finishedEncounters: 0, codedEncounters: 0, medianConsultMinutes: null };
  }

  private listBuckets(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsPracticeBucketRow[]> {
    return tx.$queryRaw<AnalyticsPracticeBucketRow[]>`
      ${this.withFinished(scope)}
      SELECT to_char(
               date_trunc(${scope.granularity}, ("started_at" AT TIME ZONE 'UTC') AT TIME ZONE ${scope.timeZone}),
               'YYYY-MM-DD') AS "bucket",
             count(*)::int AS "finishedEncounters"
      FROM finished
      GROUP BY 1`;
  }

  /** The clinician's appointments scheduled in the range that were kept or missed. */
  private async readAppointments(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsPracticeAppointmentRow> {
    const rows = await tx.$queryRaw<AnalyticsPracticeAppointmentRow[]>`
      SELECT count(*) FILTER (WHERE a."status" = 'COMPLETED')::int AS "completedAppointments",
             count(*) FILTER (WHERE a."status" = 'NO_SHOW')::int AS "noShowAppointments"
      FROM "appointments" a
      WHERE a."deleted_at" IS NULL
        AND a."doctor_id" = ${scope.doctorId}::uuid
        AND a."scheduled_at" >= ${scope.startUtc}::timestamp
        AND a."scheduled_at" < ${scope.endUtc}::timestamp`;
    return rows[0] ?? { completedAppointments: 0, noShowAppointments: 0 };
  }

  private listDiagnoses(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsPracticeDiagnosisRow[]> {
    return tx.$queryRaw<AnalyticsPracticeDiagnosisRow[]>`
      ${this.withFinished(scope)}
      SELECT "code", "name", count(*)::int AS "count"
      FROM finished
      WHERE "code" IS NOT NULL
      GROUP BY 1, 2
      ORDER BY "count" DESC, "code"
      LIMIT ${TOP_DIAGNOSES}`;
  }
}

import { Injectable } from '@nestjs/common';
import type {
  AnalyticsCaseMixBucketRow,
  AnalyticsCaseMixSnapshot,
  AnalyticsCaseMixTotalsRow,
  AnalyticsCodeCountRow,
  AnalyticsGroupCountRow,
  AnalyticsPoliCodingRow,
  AnalyticsSqlScope,
} from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';
import type { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { AnalyticsQueryRepository } from './analytics-query.repository';

/**
 * The case-mix dashboard's reads (P29-T12, PRD FR-CLN-01 to 04), over the
 * encounter, diagnosis, procedure and code tables (D-049). Every query
 * counts; none selects a patient, an encounter id or free text.
 */
@Injectable()
export class AnalyticsCaseMixRepository {
  constructor(private readonly analyticsQueryRepository: AnalyticsQueryRepository) {}

  /** Every case-mix figure for one period, in one read-only transaction. */
  readSnapshot(scope: AnalyticsSqlScope): Promise<AnalyticsCaseMixSnapshot> {
    return this.analyticsQueryRepository.runReadOnly(async (tx) => ({
      totals: await this.readTotals(tx, scope),
      buckets: await this.listBuckets(tx, scope),
      diagnoses: await this.listDiagnoses(tx, scope),
      groups: await this.listGroups(tx, scope),
      poli: await this.listPoliCoding(tx, scope),
      procedures: await this.listProcedures(tx, scope),
    }));
  }

  /**
   * Finished encounters started in the range, narrowed by clinician, poli and
   * payer, each with its primary diagnosis's ICD-10 code when it has one. A
   * primary diagnosis typed as free text, with no code behind it, leaves
   * `code` null: that encounter is not coded. Cancelled encounters never
   * count. One primary diagnosis per encounter at most, by a unique index.
   */
  private withFinished(scope: AnalyticsSqlScope): Prisma.Sql {
    const doctorFilter = scope.doctorId
      ? Prisma.sql`AND e."doctor_id" = ${scope.doctorId}::uuid`
      : Prisma.empty;
    const poliFilter = scope.specialtyId
      ? Prisma.sql`AND r."specialty_id" = ${scope.specialtyId}::uuid`
      : Prisma.empty;
    const payerFilter = scope.payerType
      ? Prisma.sql`AND r."payer_type" = ${scope.payerType}::payer_type`
      : Prisma.empty;
    return Prisma.sql`WITH finished AS (
      SELECT e."id", e."started_at", r."specialty_id",
             c."code", COALESCE(c."display_indonesian", c."display") AS "name"
      FROM "encounters" e
      JOIN "registrations" r ON r."id" = e."registration_id"
      LEFT JOIN "diagnoses" d
        ON d."encounter_id" = e."id" AND d."type" = 'PRIMARY' AND d."deleted_at" IS NULL
      LEFT JOIN "icd10_codes" c ON c."id" = d."icd10_code_id"
      WHERE e."deleted_at" IS NULL
        AND e."status" = 'FINISHED'
        AND e."started_at" >= ${scope.startUtc}::timestamp
        AND e."started_at" < ${scope.endUtc}::timestamp
        ${doctorFilter} ${poliFilter} ${payerFilter}
    )`;
  }

  private async readTotals(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsCaseMixTotalsRow> {
    const rows = await tx.$queryRaw<AnalyticsCaseMixTotalsRow[]>`
      ${this.withFinished(scope)}
      SELECT count(*)::int AS "finishedEncounters",
             count("code")::int AS "codedEncounters",
             count(DISTINCT "code")::int AS "distinctCodes"
      FROM finished`;
    return rows[0] ?? { finishedEncounters: 0, codedEncounters: 0, distinctCodes: 0 };
  }

  private listBuckets(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsCaseMixBucketRow[]> {
    return tx.$queryRaw<AnalyticsCaseMixBucketRow[]>`
      ${this.withFinished(scope)}
      SELECT to_char(
               date_trunc(${scope.granularity}, ("started_at" AT TIME ZONE 'UTC') AT TIME ZONE ${scope.timeZone}),
               'YYYY-MM-DD') AS "bucket",
             count(*)::int AS "finishedEncounters",
             count("code")::int AS "codedEncounters"
      FROM finished
      GROUP BY 1`;
  }

  /** Every coded primary diagnosis by count; the builder keeps the top ten and folds the rest. */
  private listDiagnoses(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsCodeCountRow[]> {
    return tx.$queryRaw<AnalyticsCodeCountRow[]>`
      ${this.withFinished(scope)}
      SELECT "code", "name", count(*)::int AS "count"
      FROM finished
      WHERE "code" IS NOT NULL
      GROUP BY 1, 2
      ORDER BY "count" DESC, "code"`;
  }

  /** By the code's first letter, which is how the ICD-10 chapters are cut. */
  private listGroups(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsGroupCountRow[]> {
    return tx.$queryRaw<AnalyticsGroupCountRow[]>`
      ${this.withFinished(scope)}
      SELECT upper(left("code", 1)) AS "group", count(*)::int AS "count"
      FROM finished
      WHERE "code" IS NOT NULL
      GROUP BY 1
      ORDER BY "count" DESC, "group"`;
  }

  private listPoliCoding(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsPoliCodingRow[]> {
    return tx.$queryRaw<AnalyticsPoliCodingRow[]>`
      ${this.withFinished(scope)}
      SELECT f."specialty_id"::text AS "specialtyId", s."name" AS "specialtyName",
             count(*)::int AS "finishedEncounters",
             count(f."code")::int AS "codedEncounters"
      FROM finished f
      LEFT JOIN "specialties" s ON s."id" = f."specialty_id"
      GROUP BY 1, 2
      ORDER BY (count(*) - count(f."code")) DESC, 2`;
  }

  /**
   * Procedures done in the period's finished encounters, by ICD-9-CM code.
   * Grouped on the code alone: a procedure typed without a catalog entry
   * carries its own wording, and one code must not split into two rows.
   */
  private listProcedures(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsCodeCountRow[]> {
    return tx.$queryRaw<AnalyticsCodeCountRow[]>`
      ${this.withFinished(scope)}
      SELECT COALESCE(ic."code", p."code") AS "code",
             min(COALESCE(ic."display_indonesian", ic."display", p."display")) AS "name",
             count(*)::int AS "count"
      FROM "procedures" p
      JOIN finished f ON f."id" = p."encounter_id"
      LEFT JOIN "icd9cm_codes" ic ON ic."id" = p."icd9cm_code_id"
      WHERE p."deleted_at" IS NULL
      GROUP BY 1
      ORDER BY "count" DESC, 1`;
  }
}

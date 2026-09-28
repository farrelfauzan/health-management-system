import { Injectable } from '@nestjs/common';
import type {
  AnalyticsBpjsTypeRow,
  AnalyticsReportingHealthSnapshot,
  AnalyticsReportingReadiness,
  AnalyticsSatusehatKindDbRow,
  AnalyticsSqlScope,
  ReadReportingHealthParams,
} from '@hms/shared-types';

import type { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { AnalyticsQueryRepository } from './analytics-query.repository';

/**
 * The reporting status page's reads (P29-T06, PRD FR-INT-01 to 03). Never
 * selects `last_error`: a failure's text can quote the payload, and with it a
 * patient, so the page counts failures and links to the list that explains
 * them. `pending` and `failed` ignore the range — they are what needs doing
 * now — while `submitted` and the readiness counts are the range's.
 */
@Injectable()
export class AnalyticsReportingHealthRepository {
  constructor(private readonly analyticsQueryRepository: AnalyticsQueryRepository) {}

  /** Every reporting figure, in one read-only transaction. */
  readSnapshot({
    scope,
    includeBpjs,
  }: ReadReportingHealthParams): Promise<AnalyticsReportingHealthSnapshot> {
    return this.analyticsQueryRepository.runReadOnly(async (tx) => ({
      satusehat: await this.listSatusehatKinds(tx, scope),
      bpjs: includeBpjs ? await this.listBpjsTypes(tx, scope) : null,
      readiness: await this.countReadiness(tx, scope),
    }));
  }

  private listSatusehatKinds(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsSatusehatKindDbRow[]> {
    return tx.$queryRaw<AnalyticsSatusehatKindDbRow[]>`
      SELECT s."kind"::text AS "kind",
             count(*) FILTER (
               WHERE s."status" = 'SUBMITTED'
                 AND s."submitted_at" >= ${scope.startUtc}::timestamp
                 AND s."submitted_at" < ${scope.endUtc}::timestamp)::int AS "submitted",
             count(*) FILTER (WHERE s."status" = 'PENDING')::int AS "pending",
             count(*) FILTER (WHERE s."status" = 'FAILED')::int AS "failed",
             min(s."created_at") FILTER (WHERE s."status" = 'PENDING') AS "oldestPendingAt"
      FROM "satusehat_submissions" s
      WHERE s."status" IN ('PENDING', 'FAILED')
         OR (s."submitted_at" >= ${scope.startUtc}::timestamp AND s."submitted_at" < ${scope.endUtc}::timestamp)
      GROUP BY s."kind"`;
  }

  private listBpjsTypes(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsBpjsTypeRow[]> {
    return tx.$queryRaw<AnalyticsBpjsTypeRow[]>`
      SELECT b."type"::text AS "type",
             count(*) FILTER (
               WHERE b."status" = 'SUBMITTED'
                 AND b."submitted_at" >= ${scope.startUtc}::timestamp
                 AND b."submitted_at" < ${scope.endUtc}::timestamp)::int AS "submitted",
             count(*) FILTER (WHERE b."status" = 'PENDING')::int AS "pending",
             count(*) FILTER (WHERE b."status" = 'FAILED')::int AS "failed"
      FROM "bpjs_submissions" b
      WHERE b."status" IN ('PENDING', 'FAILED')
         OR (b."submitted_at" >= ${scope.startUtc}::timestamp AND b."submitted_at" < ${scope.endUtc}::timestamp)
      GROUP BY b."type"`;
  }

  /**
   * Finished visits in the range SATUSEHAT cannot take yet. A clinician
   * without a NIK cannot be resolved to a SATUSEHAT practitioner.
   */
  private async countReadiness(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsReportingReadiness> {
    const rows = await tx.$queryRaw<AnalyticsReportingReadiness[]>`
      SELECT count(*) FILTER (WHERE pd."id" IS NULL)::int AS "encountersWithoutPrimaryDiagnosis",
             count(*) FILTER (WHERE d."nik_index" IS NULL)::int AS "encountersWithUnlinkedClinician"
      FROM "encounters" e
      JOIN "doctor_profiles" d ON d."id" = e."doctor_id"
      LEFT JOIN "diagnoses" pd
        ON pd."encounter_id" = e."id" AND pd."type" = 'PRIMARY' AND pd."deleted_at" IS NULL
      WHERE e."deleted_at" IS NULL
        AND e."status" = 'FINISHED'
        AND e."started_at" >= ${scope.startUtc}::timestamp
        AND e."started_at" < ${scope.endUtc}::timestamp`;
    return rows[0] ?? { encountersWithoutPrimaryDiagnosis: 0, encountersWithUnlinkedClinician: 0 };
  }
}

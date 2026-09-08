import { LaboratorySettingsRecord, UpdateLaboratorySettingsPayload } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Persistence for the bench's operating rules (P18-T04).
 *
 * One row on the single-tenant deployment, kept singular by a partial unique
 * index on `facility_id IS NULL` — Postgres treats NULLs as distinct, so the
 * ordinary unique constraint does not do it. Reads never create the row: an
 * absent row and the strict defaults are the same answer, and a GET must not
 * write.
 */
@Injectable()
export class LaboratorySettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findLaboratorySettings(): Promise<LaboratorySettingsRecord | null> {
    const row = await this.prisma.laboratorySettings.findFirst({
      where: { facilityId: null },
    });
    if (!row) {
      return null;
    }

    return {
      technicianMayVerify: row.technicianMayVerify,
      singleOperator: row.singleOperator,
      updatedById: row.updatedById,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Creates the row on first write with the strict defaults for whatever the
   * caller did not name, so a PATCH that turns one flag on never silently
   * turns the other on with it.
   */
  async upsertLaboratorySettings(
    payload: UpdateLaboratorySettingsPayload,
  ): Promise<LaboratorySettingsRecord> {
    const existing = await this.prisma.laboratorySettings.findFirst({
      where: { facilityId: null },
      select: { id: true },
    });
    const data = {
      ...(payload.technicianMayVerify === undefined
        ? {}
        : { technicianMayVerify: payload.technicianMayVerify }),
      ...(payload.singleOperator === undefined ? {} : { singleOperator: payload.singleOperator }),
      updatedById: payload.updatedById,
    };
    const row = existing
      ? await this.prisma.laboratorySettings.update({ where: { id: existing.id }, data })
      : await this.prisma.laboratorySettings.create({ data });

    return {
      technicianMayVerify: row.technicianMayVerify,
      singleOperator: row.singleOperator,
      updatedById: row.updatedById,
      updatedAt: row.updatedAt,
    };
  }
}

import { SaveTaxSettingsPayload, TaxSettingsRecord } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { TaxSettings } from '../../../generated/prisma/client';

/**
 * Persistence for the clinic's tax profile (P27-T02).
 *
 * One row on the single-tenant deployment, kept singular by a partial unique
 * index on `facility_id IS NULL`, exactly like `laboratory_settings`. Reads
 * never create the row: an absent row and the defaults are the same answer,
 * and a GET must not write.
 */
@Injectable()
export class TaxSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findTaxSettings(): Promise<TaxSettingsRecord | null> {
    const row = await this.prisma.taxSettings.findFirst({ where: { facilityId: null } });
    return row ? this.toRecord(row) : null;
  }

  /**
   * Writes the whole merged profile. The service has already combined the
   * request with the stored row and judged the result, so every column is
   * written together and the CHECKs see one consistent state.
   */
  async saveTaxSettings(payload: SaveTaxSettingsPayload): Promise<TaxSettingsRecord> {
    const existing = await this.prisma.taxSettings.findFirst({
      where: { facilityId: null },
      select: { id: true },
    });
    const data = {
      taxpayerType: payload.taxpayerType,
      incomeTaxRegime: payload.incomeTaxRegime,
      pp55StartYear: payload.pp55StartYear,
      isPkp: payload.isPkp,
      pkpSince: payload.pkpSince === null ? null : new Date(`${payload.pkpSince}T00:00:00.000Z`),
      nitku: payload.nitku,
      updatedById: payload.updatedById,
    };
    const row = existing
      ? await this.prisma.taxSettings.update({ where: { id: existing.id }, data })
      : await this.prisma.taxSettings.create({ data });
    return this.toRecord(row);
  }

  private toRecord(row: TaxSettings): TaxSettingsRecord {
    return {
      taxpayerType: row.taxpayerType,
      incomeTaxRegime: row.incomeTaxRegime,
      pp55StartYear: row.pp55StartYear,
      isPkp: row.isPkp,
      // A DATE column comes back as UTC midnight; the calendar day is its
      // first ten characters, whatever the server's timezone.
      pkpSince: row.pkpSince ? row.pkpSince.toISOString().slice(0, 10) : null,
      nitku: row.nitku,
      updatedById: row.updatedById,
      updatedAt: row.updatedAt,
    };
  }
}

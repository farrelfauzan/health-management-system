import {
  CreateNonCapitationTariffInput,
  UpdateNonCapitationSettingsInput,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  BpjsNonCapitationSettings,
  BpjsNonCapitationTariff,
} from '../../../generated/prisma/client';
import { NonCapitationTariffOverlapError } from './non-capitation-tariff-overlap.error';

const MILLISECONDS_PER_DAY = 86_400_000;

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * The induk FKTP settings and the tariff history of the non-capitation recap
 * (P25-T16). The settings row is the single-tenant singleton (`facility_id`
 * null), like the clinic profile.
 */
@Injectable()
export class BpjsNonCapitationConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSettings(): Promise<BpjsNonCapitationSettings | null> {
    return this.prisma.bpjsNonCapitationSettings.findFirst({ where: { facilityId: null } });
  }

  async saveSettings(
    input: UpdateNonCapitationSettingsInput,
    updatedById: string,
  ): Promise<BpjsNonCapitationSettings> {
    const data = { ...input, updatedById };
    const existing = await this.findSettings();
    if (existing === null) {
      return this.prisma.bpjsNonCapitationSettings.create({ data });
    }
    return this.prisma.bpjsNonCapitationSettings.update({ where: { id: existing.id }, data });
  }

  listTariffs(): Promise<BpjsNonCapitationTariff[]> {
    return this.prisma.bpjsNonCapitationTariff.findMany({
      orderBy: [{ serviceType: 'asc' }, { validFrom: 'asc' }],
    });
  }

  /**
   * Adds a tariff from `validFrom` and closes the row it supersedes the day
   * before, in one transaction. Refused when a row of the type already starts
   * on or after that date.
   */
  createTariff(
    input: CreateNonCapitationTariffInput,
    createdById: string,
  ): Promise<BpjsNonCapitationTariff> {
    const validFrom = toDateOnly(input.validFrom);
    return this.prisma.executeTransaction(async (tx) => {
      const later = await tx.bpjsNonCapitationTariff.count({
        where: { serviceType: input.serviceType, validFrom: { gte: validFrom } },
      });
      if (later > 0) {
        throw new NonCapitationTariffOverlapError(input.serviceType);
      }
      await tx.bpjsNonCapitationTariff.updateMany({
        where: {
          serviceType: input.serviceType,
          OR: [{ validUntil: null }, { validUntil: { gte: validFrom } }],
        },
        data: { validUntil: new Date(validFrom.getTime() - MILLISECONDS_PER_DAY) },
      });
      return tx.bpjsNonCapitationTariff.create({
        data: {
          serviceType: input.serviceType,
          amount: input.amount,
          validFrom,
          regulationReference: input.regulationReference,
          createdById,
        },
      });
    });
  }
}

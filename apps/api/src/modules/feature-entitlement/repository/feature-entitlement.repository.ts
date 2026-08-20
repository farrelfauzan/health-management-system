import { FeatureEntitlementRecord, UpdateFeatureEntitlementPayload } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

const ENTITLEMENT_SELECT = {
  id: true,
  featureKey: true,
  isEnabled: true,
  notes: true,
  updatedById: true,
  updatedAt: true,
} as const;

@Injectable()
export class FeatureEntitlementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<FeatureEntitlementRecord[]> {
    return this.prisma.featureEntitlement.findMany({
      orderBy: { featureKey: 'asc' },
      select: ENTITLEMENT_SELECT,
    });
  }

  /**
   * Writes the switch, creating the row if the seed has not run since the key
   * was added to the catalog. An upsert rather than an update because the
   * catalog is the definition and the table is only state: a key the operator
   * can see in the admin list must be togglable whether or not a row exists
   * for it yet.
   */
  async upsertEntitlement(
    payload: UpdateFeatureEntitlementPayload,
  ): Promise<FeatureEntitlementRecord> {
    const notes = payload.notes === undefined ? undefined : (payload.notes ?? null);
    return this.prisma.featureEntitlement.upsert({
      where: { featureKey: payload.featureKey },
      create: {
        featureKey: payload.featureKey,
        isEnabled: payload.isEnabled,
        notes: notes ?? null,
        updatedById: payload.updatedById,
      },
      update: {
        isEnabled: payload.isEnabled,
        ...(notes === undefined ? {} : { notes }),
        updatedById: payload.updatedById,
      },
      select: ENTITLEMENT_SELECT,
    });
  }
}

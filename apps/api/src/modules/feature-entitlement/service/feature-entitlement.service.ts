import {
  FEATURE_CATALOG,
  FeatureAvailabilityView,
  FeatureCatalogEntry,
  FeatureEntitlementRecord,
  FeatureEntitlementView,
  FeatureKey,
  UpdateFeatureEntitlementInput,
  findFeatureCatalogEntry,
  isFeatureKey,
} from '@hms/shared-types';
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';
import { FeatureEntitlementRepository } from '../repository/feature-entitlement.repository';
import { FeatureAvailabilityCacheService } from './feature-availability-cache.service';

/**
 * The per-client feature switches (IMP-7).
 *
 * The catalog is the definition and the table is only state, so every read
 * here starts from `FEATURE_CATALOG` and joins rows onto it — never the other
 * way round. That is what makes a key added in code but not yet seeded behave
 * like a key that has simply never been touched, rather than vanishing from
 * the admin screen until someone remembers to re-seed.
 */
@Injectable()
export class FeatureEntitlementService {
  constructor(
    private readonly featureEntitlementRepository: FeatureEntitlementRepository,
    private readonly auditService: AuditService,
    private readonly featureAvailabilityCache: FeatureAvailabilityCacheService,
  ) {}

  /** The full admin list: every catalog entry with its switch state. */
  async getEntitlements(): Promise<FeatureEntitlementView[]> {
    const recordsByKey = await this.loadRecordsByKey();
    return FEATURE_CATALOG.map((entry) => this.toView(entry, recordsByKey.get(entry.key)));
  }

  /**
   * The keys a client may use, for any authenticated caller. Answers 200 even
   * when everything is off — modelled on `GET /chat/availability`, because a
   * client that cannot distinguish "nothing enabled" from "the availability
   * call failed" will either hide a feature the clinic bought or show one it
   * did not.
   */
  async getAvailability(): Promise<FeatureAvailabilityView> {
    const recordsByKey = await this.loadRecordsByKey();
    const enabledKeys = FEATURE_CATALOG.filter((entry) =>
      this.resolveIsEnabled(recordsByKey.get(entry.key)),
    ).map((entry) => entry.key);
    return { enabledKeys };
  }

  async updateEntitlement(
    featureKey: string,
    input: UpdateFeatureEntitlementInput,
    actorUserId: string,
  ): Promise<FeatureEntitlementView> {
    const entry = this.findCatalogEntry(featureKey);
    const recordsByKey = await this.loadRecordsByKey();
    const previous = recordsByKey.get(entry.key);
    const record = await this.featureEntitlementRepository.upsertEntitlement({
      featureKey: entry.key,
      isEnabled: input.isEnabled,
      notes: input.notes,
      updatedById: actorUserId,
    });
    // Directly, not on the TTL: the operator who just threw the switch is the
    // one most likely to check that it took (IMP-8).
    this.featureAvailabilityCache.invalidate();
    await this.auditService.record({
      action: AuditAction.FEATURE_TOGGLED,
      resource: 'feature-entitlement',
      actorUserId,
      resourceId: record.id,
      metadata: {
        featureKey: entry.key,
        before: this.resolveIsEnabled(previous),
        after: record.isEnabled,
      },
    });
    return this.toView(entry, record);
  }

  /**
   * A key with no row reads as **enabled**, not disabled.
   *
   * Migrations and the seed are separate deploy steps, so a release that adds
   * a catalog key is briefly live with the migration applied and the row
   * absent. Failing closed there would turn every such release into a silent
   * outage of a feature the clinic is paying for. Failing open costs nothing
   * that matters, because entitlements are commercial packaging and not the
   * security boundary — `PermissionsGuard` still stands in front of every
   * route behind an un-entitled feature.
   */
  private resolveIsEnabled(record: FeatureEntitlementRecord | undefined): boolean {
    return record?.isEnabled ?? true;
  }

  /**
   * Resolves the key against the catalog, not against the table. A row for a
   * key nothing implements would be a switch that controls nothing, and an
   * operator who believed it was off would be wrong in the direction that
   * matters.
   */
  private findCatalogEntry(featureKey: string): FeatureCatalogEntry {
    const entry = findFeatureCatalogEntry(featureKey);
    if (!entry) {
      throw new NotFoundException(`Unknown feature key: ${featureKey}`);
    }
    return entry;
  }

  private async loadRecordsByKey(): Promise<Map<FeatureKey, FeatureEntitlementRecord>> {
    const records = await this.featureEntitlementRepository.findAll();
    const byKey = new Map<FeatureKey, FeatureEntitlementRecord>();
    for (const record of records) {
      // A row whose key left the catalog is history, not state: it controls
      // nothing, so it is ignored here rather than deleted. Dropping it would
      // discard the note explaining why someone switched it off.
      if (isFeatureKey(record.featureKey)) {
        byKey.set(record.featureKey, record);
      }
    }
    return byKey;
  }

  private toView(
    entry: FeatureCatalogEntry,
    record: FeatureEntitlementRecord | undefined,
  ): FeatureEntitlementView {
    return {
      key: entry.key,
      name: entry.name,
      description: entry.description,
      navHrefs: [...entry.navHrefs],
      isEnabled: this.resolveIsEnabled(record),
      ...(record?.notes ? { notes: record.notes } : {}),
      ...(record?.updatedById ? { updatedById: record.updatedById } : {}),
      ...(record ? { updatedAt: record.updatedAt.toISOString() } : {}),
    };
  }
}

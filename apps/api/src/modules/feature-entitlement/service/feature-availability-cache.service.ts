import { Injectable } from '@nestjs/common';

import { FeatureEntitlementRepository } from '../repository/feature-entitlement.repository';

/**
 * The entitlement state as `FeatureGuard` needs it: one boolean, on every
 * request, without a database round trip (IMP-8).
 *
 * What is cached is the **disabled** key set, not the enabled one. That is the
 * same fail-open rule `FeatureEntitlementService` applies, expressed once: a
 * key the table has never heard of is absent from this set and therefore
 * enabled, so a release that adds a catalog key is not an outage in the window
 * before its seed row exists.
 *
 * Writes invalidate directly, so an operator toggling a feature sees it take
 * effect on their next request. The TTL is what covers the other instances in
 * a multi-process deployment, where an in-memory invalidation cannot reach —
 * ten seconds, chosen so a toggle propagates faster than anyone can refresh
 * and re-check.
 */
@Injectable()
export class FeatureAvailabilityCacheService {
  private static readonly TTL_MS = 10_000;

  private disabledKeys: ReadonlySet<string> | null = null;
  private expiresAtMs = 0;
  private pendingLoad: Promise<ReadonlySet<string>> | null = null;

  constructor(private readonly featureEntitlementRepository: FeatureEntitlementRepository) {}

  async isEnabled(featureKey: string): Promise<boolean> {
    const disabledKeys = await this.resolveDisabledKeys();
    return !disabledKeys.has(featureKey);
  }

  /** Called by the write path so a toggle does not wait out the TTL. */
  invalidate(): void {
    this.disabledKeys = null;
    this.expiresAtMs = 0;
  }

  private async resolveDisabledKeys(): Promise<ReadonlySet<string>> {
    if (this.disabledKeys !== null && Date.now() < this.expiresAtMs) {
      return this.disabledKeys;
    }
    // One shared load rather than one per concurrent request: a cold cache on a
    // busy instance would otherwise turn every in-flight request into its own
    // query, which is the stampede this cache exists to avoid.
    this.pendingLoad ??= this.loadDisabledKeys();
    try {
      return await this.pendingLoad;
    } finally {
      this.pendingLoad = null;
    }
  }

  private async loadDisabledKeys(): Promise<ReadonlySet<string>> {
    const records = await this.featureEntitlementRepository.findAll();
    const disabledKeys = new Set(
      records.filter((record) => !record.isEnabled).map((record) => record.featureKey),
    );
    this.disabledKeys = disabledKeys;
    this.expiresAtMs = Date.now() + FeatureAvailabilityCacheService.TTL_MS;
    return disabledKeys;
  }
}

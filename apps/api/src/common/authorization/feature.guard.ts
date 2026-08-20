import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { FeatureAvailabilityCacheService } from '../../modules/feature-entitlement/service/feature-availability-cache.service';
import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';

/**
 * Enforces per-client feature entitlements server-side (IMP-8).
 *
 * The rule it implements is one sentence: **a disabled feature overrides any
 * role permission.** It therefore runs *after* `PermissionsGuard`, so a caller
 * who lacks the grant still gets 403 FORBIDDEN and learns nothing about what
 * this clinic did or did not buy, while a caller who has the grant gets the
 * accurate `FEATURE_DISABLED` and can render "not included in your plan"
 * instead of "you are not allowed".
 *
 * It deliberately does **not** stand down for `@PublicRoute()`. The channel
 * webhooks are public — they authenticate with a provider signature rather
 * than a session — and a clinic that did not buy the customer-service channels
 * must not have its inbound WhatsApp endpoint answering anyway.
 *
 * Cost in the steady state is a `Map` lookup: `FeatureAvailabilityCacheService`
 * holds the disabled key set, refreshed on a short TTL and invalidated on
 * write.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureAvailabilityCache: FeatureAvailabilityCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<string | null | undefined>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Undefined is an unannotated route — platform core, gated by permissions
    // alone. Null is `@FeatureIndependent()`, an annotated controller's route
    // that deliberately survives its feature being switched off.
    if (featureKey === undefined || featureKey === null) {
      return true;
    }

    const isEnabled = await this.featureAvailabilityCache.isEnabled(featureKey);

    if (!isEnabled) {
      throw new ForbiddenException({
        code: 'FEATURE_DISABLED',
        message: `The ${featureKey} feature is not enabled for this client`,
      });
    }

    return true;
  }
}

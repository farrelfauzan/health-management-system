import { FeatureKey } from '@hms/shared-types';
import { SetMetadata } from '@nestjs/common';

export const REQUIRE_FEATURE_KEY = 'require_feature_key';

/**
 * Declares that everything on this controller belongs to one optional product
 * feature (IMP-8). `FeatureGuard` refuses the route with `FEATURE_DISABLED`
 * when the client is not entitled to it.
 *
 * Applied at the class level, because "which feature is this" is a property of
 * a module and not of a handler — a route added to `ChatController` tomorrow
 * is part of the chatbot whether or not anyone remembers to say so. The
 * handful of routes that must survive their feature being switched off carry
 * `@FeatureIndependent()` instead, which reads as the exception it is.
 */
export function RequireFeature(featureKey: FeatureKey): ClassDecorator & MethodDecorator {
  return SetMetadata(REQUIRE_FEATURE_KEY, featureKey);
}

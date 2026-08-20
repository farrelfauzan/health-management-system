import { SetMetadata } from '@nestjs/common';

import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';

/**
 * Keeps one route reachable while its controller's feature is switched off.
 *
 * There is exactly one shape of route that earns this: the availability check
 * a client calls to *discover* that a feature is off. Answering it with
 * `FEATURE_DISABLED` would leave the client unable to tell "this clinic did
 * not buy chat" from "the availability call failed", which is the whole reason
 * `GET /chat/availability` answers 200 when chat is disabled.
 *
 * It overrides `@RequireFeature()` by writing the same metadata key at handler
 * level, so the override is a single `getAllAndOverride` and cannot be
 * silently half-applied.
 */
export function FeatureIndependent(): MethodDecorator {
  return SetMetadata(REQUIRE_FEATURE_KEY, null);
}

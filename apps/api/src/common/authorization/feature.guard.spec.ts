import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { FeatureAvailabilityCacheService } from '../../modules/feature-entitlement/service/feature-availability-cache.service';
import { FeatureGuard } from './feature.guard';

describe('FeatureGuard', () => {
  function buildContext(): ExecutionContext {
    return {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    } as unknown as ExecutionContext;
  }

  function buildGuard(featureKey: string | null | undefined, isEnabled: boolean) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(featureKey),
    } as unknown as Reflector;
    const isEnabledMock = jest.fn().mockResolvedValue(isEnabled);
    const cache = { isEnabled: isEnabledMock } as unknown as FeatureAvailabilityCacheService;
    return { guard: new FeatureGuard(reflector, cache), isEnabledMock };
  }

  it('allows an unannotated route without consulting entitlements', async () => {
    const { guard, isEnabledMock } = buildGuard(undefined, false);

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(isEnabledMock).not.toHaveBeenCalled();
  });

  it('allows a route marked feature-independent even when the feature is off', async () => {
    const { guard, isEnabledMock } = buildGuard(null, false);

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(isEnabledMock).not.toHaveBeenCalled();
  });

  it('allows an annotated route while its feature is enabled', async () => {
    const { guard, isEnabledMock } = buildGuard('ai-chatbot', true);

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(isEnabledMock).toHaveBeenCalledWith('ai-chatbot');
  });

  it('refuses an annotated route with FEATURE_DISABLED when the feature is off', async () => {
    const { guard } = buildGuard('ai-chatbot', false);

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(ForbiddenException);
    await guard.canActivate(buildContext()).catch((caught: ForbiddenException) => {
      expect(caught.getResponse()).toMatchObject({ code: 'FEATURE_DISABLED' });
    });
  });
});

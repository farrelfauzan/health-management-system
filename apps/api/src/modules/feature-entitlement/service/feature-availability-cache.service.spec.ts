import { FeatureEntitlementRepository } from '../repository/feature-entitlement.repository';
import { FeatureAvailabilityCacheService } from './feature-availability-cache.service';

describe('FeatureAvailabilityCacheService', () => {
  function buildRecord(featureKey: string, isEnabled: boolean) {
    return {
      id: `id-${featureKey}`,
      featureKey,
      isEnabled,
      notes: null,
      updatedById: null,
      updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    };
  }

  function buildCache(records: ReturnType<typeof buildRecord>[]) {
    const findAllMock = jest.fn().mockResolvedValue(records);
    const repository = { findAll: findAllMock } as unknown as FeatureEntitlementRepository;
    return { cache: new FeatureAvailabilityCacheService(repository), findAllMock };
  }

  it('reads a key with no row as enabled', async () => {
    const { cache } = buildCache([]);

    await expect(cache.isEnabled('ai-chatbot')).resolves.toBe(true);
  });

  it('reads a disabled row as disabled', async () => {
    const { cache } = buildCache([buildRecord('ai-chatbot', false)]);

    await expect(cache.isEnabled('ai-chatbot')).resolves.toBe(false);
  });

  it('queries once for many lookups inside the TTL', async () => {
    const { cache, findAllMock } = buildCache([buildRecord('ai-chatbot', false)]);

    await cache.isEnabled('ai-chatbot');
    await cache.isEnabled('pharmacy');
    await cache.isEnabled('billing');

    expect(findAllMock).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent cold lookups into one query', async () => {
    const { cache, findAllMock } = buildCache([buildRecord('ai-chatbot', false)]);

    await Promise.all([
      cache.isEnabled('ai-chatbot'),
      cache.isEnabled('ai-chatbot'),
      cache.isEnabled('ai-chatbot'),
    ]);

    expect(findAllMock).toHaveBeenCalledTimes(1);
  });

  it('re-reads after an invalidation rather than waiting out the TTL', async () => {
    const { cache, findAllMock } = buildCache([buildRecord('ai-chatbot', false)]);
    await cache.isEnabled('ai-chatbot');

    findAllMock.mockResolvedValue([buildRecord('ai-chatbot', true)]);
    cache.invalidate();

    await expect(cache.isEnabled('ai-chatbot')).resolves.toBe(true);
    expect(findAllMock).toHaveBeenCalledTimes(2);
  });

  it('re-reads once the TTL has passed', async () => {
    const { cache, findAllMock } = buildCache([buildRecord('ai-chatbot', false)]);
    await cache.isEnabled('ai-chatbot');

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    try {
      await cache.isEnabled('ai-chatbot');
    } finally {
      nowSpy.mockRestore();
    }

    expect(findAllMock).toHaveBeenCalledTimes(2);
  });
});

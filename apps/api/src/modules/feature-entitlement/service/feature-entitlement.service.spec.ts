import { FEATURE_KEYS, FeatureEntitlementRecord } from '@hms/shared-types';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';
import { FeatureEntitlementRepository } from '../repository/feature-entitlement.repository';
import { FeatureAvailabilityCacheService } from './feature-availability-cache.service';
import { FeatureEntitlementService } from './feature-entitlement.service';

describe('FeatureEntitlementService', () => {
  const ACTOR_USER_ID = '11111111-1111-4111-8111-111111111111';

  function buildRecord(overrides: Partial<FeatureEntitlementRecord>): FeatureEntitlementRecord {
    return {
      id: '22222222-2222-4222-8222-222222222222',
      featureKey: 'bpjs-pcare',
      isEnabled: true,
      notes: null,
      updatedById: null,
      updatedAt: new Date('2026-08-20T00:00:00.000Z'),
      ...overrides,
    };
  }

  function buildService(records: FeatureEntitlementRecord[]) {
    const mockRepository = {
      findAll: jest.fn().mockResolvedValue(records),
      upsertEntitlement: jest.fn(),
    } as unknown as jest.Mocked<FeatureEntitlementRepository>;
    const mockAuditService = { record: jest.fn().mockResolvedValue(undefined) } as unknown as
      jest.Mocked<AuditService>;
    const mockCache = { isEnabled: jest.fn(), invalidate: jest.fn() } as unknown as jest.Mocked<
      FeatureAvailabilityCacheService
    >;
    const service = new FeatureEntitlementService(mockRepository, mockAuditService, mockCache);
    return { service, mockRepository, mockAuditService, mockCache };
  }

  it('lists every catalog entry, including keys with no stored row', async () => {
    const { service } = buildService([]);

    const actual = await service.getEntitlements();

    expect(actual.map((entitlement) => entitlement.key)).toEqual([...FEATURE_KEYS]);
  });

  it('reads a key with no stored row as enabled', async () => {
    const { service } = buildService([]);

    const actual = await service.getAvailability();

    expect(actual.enabledKeys).toEqual([...FEATURE_KEYS]);
  });

  describe('prerequisites (P16-T21, §10.6)', () => {
    it('refuses to enable delivery while invoice documents are off', async () => {
      const { service, mockRepository } = buildService([
        buildRecord({ featureKey: 'invoice-documents', isEnabled: false }),
      ]);

      await expect(
        service.updateEntitlement('invoice-delivery', { isEnabled: true }, ACTOR_USER_ID),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(mockRepository.upsertEntitlement).not.toHaveBeenCalled();
    });

    it('enables delivery once invoice documents are on', async () => {
      const { service, mockRepository } = buildService([
        buildRecord({ featureKey: 'invoice-documents', isEnabled: true }),
      ]);
      mockRepository.upsertEntitlement.mockResolvedValue(
        buildRecord({ featureKey: 'invoice-delivery', isEnabled: true }),
      );

      await service.updateEntitlement('invoice-delivery', { isEnabled: true }, ACTOR_USER_ID);

      expect(mockRepository.upsertEntitlement).toHaveBeenCalled();
    });

    it('never blocks a rollback: disabling is allowed whatever the prerequisite says', async () => {
      const { service, mockRepository } = buildService([
        buildRecord({ featureKey: 'invoice-documents', isEnabled: false }),
      ]);
      mockRepository.upsertEntitlement.mockResolvedValue(
        buildRecord({ featureKey: 'invoice-delivery', isEnabled: false }),
      );

      await service.updateEntitlement('invoice-delivery', { isEnabled: false }, ACTOR_USER_ID);

      expect(mockRepository.upsertEntitlement).toHaveBeenCalled();
    });

    it('does not cascade: turning invoice documents off leaves delivery’s own row alone', async () => {
      const { service, mockRepository } = buildService([
        buildRecord({ featureKey: 'invoice-delivery', isEnabled: true }),
      ]);
      mockRepository.upsertEntitlement.mockResolvedValue(
        buildRecord({ featureKey: 'invoice-documents', isEnabled: false }),
      );

      await service.updateEntitlement('invoice-documents', { isEnabled: false }, ACTOR_USER_ID);

      expect(mockRepository.upsertEntitlement).toHaveBeenCalledTimes(1);
    });
  });

  it('omits a disabled key from availability', async () => {
    const { service } = buildService([buildRecord({ featureKey: 'bpjs-pcare', isEnabled: false })]);

    const actual = await service.getAvailability();

    expect(actual.enabledKeys).not.toContain('bpjs-pcare');
    expect(actual.enabledKeys).toContain('pharmacy');
  });

  it('never leaks notes or the actor through availability', async () => {
    const { service } = buildService([
      buildRecord({ isEnabled: false, notes: 'not in the package', updatedById: ACTOR_USER_ID }),
    ]);

    const actual = await service.getAvailability();

    expect(Object.keys(actual)).toEqual(['enabledKeys']);
  });

  it('ignores a stored row whose key has left the catalog', async () => {
    const { service } = buildService([buildRecord({ featureKey: 'retired-feature', isEnabled: false })]);

    const actual = await service.getAvailability();

    expect(actual.enabledKeys).toEqual([...FEATURE_KEYS]);
  });

  it('refuses a key that is not in the catalog', async () => {
    const { service, mockRepository } = buildService([]);

    await expect(
      service.updateEntitlement('patients', { isEnabled: false }, ACTOR_USER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockRepository.upsertEntitlement).not.toHaveBeenCalled();
  });

  it('audits a toggle with the state on both sides of it', async () => {
    const { service, mockRepository, mockAuditService, mockCache } = buildService([
      buildRecord({ isEnabled: true }),
    ]);
    mockRepository.upsertEntitlement.mockResolvedValue(
      buildRecord({ isEnabled: false, notes: 'not in the package', updatedById: ACTOR_USER_ID }),
    );

    const actual = await service.updateEntitlement(
      'bpjs-pcare',
      { isEnabled: false, notes: 'not in the package' },
      ACTOR_USER_ID,
    );

    expect(actual.isEnabled).toBe(false);
    expect(actual.notes).toBe('not in the package');
    expect(mockCache.invalidate).toHaveBeenCalled();
    expect(mockAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.FEATURE_TOGGLED,
        resource: 'feature-entitlement',
        actorUserId: ACTOR_USER_ID,
        metadata: { featureKey: 'bpjs-pcare', before: true, after: false },
      }),
    );
  });
});

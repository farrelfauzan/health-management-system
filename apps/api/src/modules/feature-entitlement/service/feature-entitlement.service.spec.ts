import { FEATURE_KEYS, FeatureEntitlementRecord } from '@hms/shared-types';
import { NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';
import { FeatureEntitlementRepository } from '../repository/feature-entitlement.repository';
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
    const service = new FeatureEntitlementService(mockRepository, mockAuditService);
    return { service, mockRepository, mockAuditService };
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
    const { service, mockRepository, mockAuditService } = buildService([
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

import { ConfigService } from '@nestjs/config';
import type { AnalyticsReportingHealthSnapshot } from '@hms/shared-types';

import type { FeatureAvailabilityCacheService } from '../../feature-entitlement/service/feature-availability-cache.service';
import type { AnalyticsReportingHealthRepository } from '../repository/analytics-reporting-health.repository';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsRangeService } from './analytics-range.service';
import { AnalyticsReportingHealthService } from './analytics-reporting-health.service';

describe('AnalyticsReportingHealthService', () => {
  const SNAPSHOT: AnalyticsReportingHealthSnapshot = {
    satusehat: [
      {
        kind: 'ENCOUNTER',
        submitted: 10,
        pending: 2,
        failed: 3,
        oldestPendingAt: new Date('2026-09-28T05:18:00.000Z'),
      },
    ],
    bpjs: [{ type: 'PENDAFTARAN', submitted: 4, pending: 0, failed: 1 }],
    readiness: { encountersWithoutPrimaryDiagnosis: 7, encountersWithUnlinkedClinician: 1 },
  };

  function buildService(enabledKeys: readonly string[]) {
    const mockRepository = { readSnapshot: jest.fn(async () => SNAPSHOT) };
    const mockFeatures = { isEnabled: jest.fn(async (key: string) => enabledKeys.includes(key)) };
    const service = new AnalyticsReportingHealthService(
      new AnalyticsRangeService(new ConfigService({ CLINIC_TIMEZONE: 'Asia/Jakarta' })),
      new AnalyticsCacheService(),
      mockRepository as unknown as AnalyticsReportingHealthRepository,
      mockFeatures as unknown as FeatureAvailabilityCacheService,
    );
    return { service, mockRepository };
  }

  it('reads the period only, leaving poli and clinician out of a submission queue', async () => {
    const { service, mockRepository } = buildService(['bpjs-pcare']);

    await service.getReportingHealth({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: true,
      specialtyId: '11111111-1111-4111-8111-111111111111',
    });

    expect(mockRepository.readSnapshot).toHaveBeenCalledWith({
      scope: expect.objectContaining({
        startUtc: '2026-08-31 17:00:00.000',
        endUtc: '2026-09-30 17:00:00.000',
        specialtyId: undefined,
        doctorId: undefined,
      }),
      includeBpjs: true,
    });
  });

  it('writes the oldest pending time as ISO text', async () => {
    const { service } = buildService([]);

    const actual = await service.getReportingHealth({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: false,
    });

    expect(actual.data.satusehat[0]?.oldestPendingAt).toBe('2026-09-28T05:18:00.000Z');
    expect(actual.meta).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
  });

  it.each([
    [['bpjs-pcare'], true],
    [['bpjs-antrean'], true],
    [[], false],
  ])('asks for the BPJS block when %p is on: %p', async (inputEnabledKeys, expectedIncludeBpjs) => {
    const { service, mockRepository } = buildService(inputEnabledKeys);

    await service.getReportingHealth({ from: '2026-09-01', to: '2026-09-30', compare: false });

    expect(mockRepository.readSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ includeBpjs: expectedIncludeBpjs }),
    );
  });
});

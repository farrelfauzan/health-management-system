import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AnalyticsOperationsSnapshot } from '@hms/shared-types';

import type { FeatureAvailabilityCacheService } from '../../feature-entitlement/service/feature-availability-cache.service';
import type { AnalyticsOperationsRepository } from '../repository/analytics-operations.repository';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsOperationsService } from './analytics-operations.service';
import { AnalyticsRangeService } from './analytics-range.service';

describe('AnalyticsOperationsService', () => {
  const EMPTY_SNAPSHOT: AnalyticsOperationsSnapshot = {
    visitBuckets: [],
    newAndReturning: { newPatients: 0, returningPatients: 0 },
    poli: [],
    doctors: [],
    outcomes: [],
    channels: [],
    walkIns: 0,
    timings: {
      medianWaitMinutes: null,
      p90WaitMinutes: null,
      excludedWaitIntervals: 0,
      medianConsultMinutes: null,
      p90ConsultMinutes: null,
      excludedConsultIntervals: 0,
    },
    busiestHours: [],
    sessions: {
      cappedSessions: 0,
      capacity: 0,
      bookedAppointments: 0,
      movedSessions: 0,
      cancelledSessions: 0,
    },
    inpatient: null,
    inpatientDispositions: null,
  };

  function buildService(isInpatientEnabled = false) {
    const mockRepository = { readSnapshot: jest.fn(async () => EMPTY_SNAPSHOT) };
    const mockFeatures = { isEnabled: jest.fn(async () => isInpatientEnabled) };
    const service = new AnalyticsOperationsService(
      new AnalyticsRangeService(new ConfigService({ CLINIC_TIMEZONE: 'Asia/Jakarta' })),
      new AnalyticsCacheService(),
      mockRepository as unknown as AnalyticsOperationsRepository,
      mockFeatures as unknown as FeatureAvailabilityCacheService,
    );
    return { service, mockRepository };
  }

  it('reads one period and binds its UTC bounds and filters', async () => {
    const { service, mockRepository } = buildService();

    const actual = await service.getOperations({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: false,
      doctorId: '33333333-3333-4333-8333-333333333333',
    });

    expect(mockRepository.readSnapshot).toHaveBeenCalledTimes(1);
    expect(mockRepository.readSnapshot).toHaveBeenCalledWith({
      scope: {
        startUtc: '2026-08-31 17:00:00.000',
        endUtc: '2026-09-30 17:00:00.000',
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
        granularity: 'day',
        timeZone: 'Asia/Jakarta',
        doctorId: '33333333-3333-4333-8333-333333333333',
        specialtyId: undefined,
      },
      includeInpatient: false,
    });
    expect(actual.meta).toMatchObject({ from: '2026-09-01', to: '2026-09-30', granularity: 'day' });
    expect(actual.data.comparison).toBeUndefined();
  });

  it('reads the comparison period too when compare is on', async () => {
    const { service, mockRepository } = buildService();

    const actual = await service.getOperations({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: true,
    });

    expect(mockRepository.readSnapshot).toHaveBeenCalledTimes(2);
    expect(mockRepository.readSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({
          startUtc: '2026-07-31 17:00:00.000',
          endUtc: '2026-08-31 17:00:00.000',
        }),
      }),
    );
    expect(actual.data.comparison).toMatchObject({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('answers the same filter from cache', async () => {
    const { service, mockRepository } = buildService();
    const inputFilter = { from: '2026-09-01', to: '2026-09-30', compare: false };

    await service.getOperations(inputFilter);
    await service.getOperations({ ...inputFilter });

    expect(mockRepository.readSnapshot).toHaveBeenCalledTimes(1);
  });

  it('asks for the inpatient block only when the rooms and inpatient feature is on', async () => {
    const { service, mockRepository } = buildService(true);

    await service.getOperations({ from: '2026-09-01', to: '2026-09-30', compare: false });

    expect(mockRepository.readSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ includeInpatient: true }),
    );
  });

  it('refuses a payer filter until visits record the payer', async () => {
    const { service, mockRepository } = buildService();

    const actual = service.getOperations({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: false,
      payerType: 'BPJS',
    });

    await expect(actual).rejects.toBeInstanceOf(BadRequestException);
    expect(mockRepository.readSnapshot).not.toHaveBeenCalled();
  });
});

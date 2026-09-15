import { DoctorAuthorityExpiryRecord } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { NotificationService } from '../../notification/service/notification.service';
import { DoctorAuthorityExpiryWorker } from './doctor-authority-expiry.worker';
import { DoctorAuthorityService } from './doctor-authority.service';

function buildRecord(
  overrides: Partial<DoctorAuthorityExpiryRecord> = {},
): DoctorAuthorityExpiryRecord {
  return {
    authorityId: 'authority-1',
    doctorId: 'doctor-1',
    doctorName: 'Bd. Siti Aminah',
    kind: 'IUD_IMPLANT',
    decreeNumber: '440/123/2026',
    validUntil: new Date('2027-12-31T00:00:00.000Z'),
    ...overrides,
  };
}

describe('DoctorAuthorityExpiryWorker', () => {
  const doctorAuthorityServiceMock = {
    findAuthoritiesAtThreshold: jest.fn(),
    claimExpiryNotice: jest.fn(),
  };
  const notificationServiceMock = { createForUsersWithPermission: jest.fn() };
  const configServiceMock = { get: jest.fn() };
  let worker: DoctorAuthorityExpiryWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    configServiceMock.get.mockReturnValue(undefined);
    doctorAuthorityServiceMock.findAuthoritiesAtThreshold.mockResolvedValue([]);
    notificationServiceMock.createForUsersWithPermission.mockResolvedValue(2);
    worker = new DoctorAuthorityExpiryWorker(
      doctorAuthorityServiceMock as unknown as DoctorAuthorityService,
      notificationServiceMock as unknown as NotificationService,
      configServiceMock as unknown as ConfigService,
    );
  });

  it('notifies every reader once, with a link to the clinician, for an authority 60 days out', async () => {
    doctorAuthorityServiceMock.findAuthoritiesAtThreshold.mockImplementation(
      async (thresholdDays: number) =>
        thresholdDays === 60 ? [{ record: buildRecord(), daysUntilExpiry: 60, thresholdDays }] : [],
    );
    doctorAuthorityServiceMock.claimExpiryNotice.mockResolvedValue(true);

    const actualRaised = await worker.sweepOnce();

    expect(actualRaised).toBe(2);
    expect(notificationServiceMock.createForUsersWithPermission).toHaveBeenCalledTimes(1);
    expect(notificationServiceMock.createForUsersWithPermission).toHaveBeenCalledWith(
      'doctor.authority.read:any',
      expect.objectContaining({
        type: 'DOCTOR_AUTHORITY_EXPIRING',
        titleKey: 'doctorAuthorityExpiring.title',
        href: '/admin/doctors/doctor-1',
        params: expect.objectContaining({ kind: 'IUD_IMPLANT', validUntil: '2027-12-31' }),
      }),
    );
  });

  it('raises nothing on a second sweep the same day, because the threshold is already claimed', async () => {
    doctorAuthorityServiceMock.findAuthoritiesAtThreshold.mockImplementation(
      async (thresholdDays: number) =>
        thresholdDays === 60 ? [{ record: buildRecord(), daysUntilExpiry: 60, thresholdDays }] : [],
    );
    doctorAuthorityServiceMock.claimExpiryNotice.mockResolvedValue(false);

    const actualRaised = await worker.sweepOnce();

    expect(actualRaised).toBe(0);
    expect(notificationServiceMock.createForUsersWithPermission).not.toHaveBeenCalled();
  });

  it('sends the expired type once the end date has passed', async () => {
    doctorAuthorityServiceMock.findAuthoritiesAtThreshold.mockImplementation(
      async (thresholdDays: number) =>
        thresholdDays === 0 ? [{ record: buildRecord(), daysUntilExpiry: -3, thresholdDays }] : [],
    );
    doctorAuthorityServiceMock.claimExpiryNotice.mockResolvedValue(true);

    await worker.sweepOnce();

    expect(notificationServiceMock.createForUsersWithPermission).toHaveBeenCalledWith(
      'doctor.authority.read:any',
      expect.objectContaining({
        type: 'DOCTOR_AUTHORITY_EXPIRED',
        bodyKey: 'doctorAuthorityExpired.body',
      }),
    );
  });

  it('claims each threshold separately so a missed 60-day mark is still announced', async () => {
    doctorAuthorityServiceMock.findAuthoritiesAtThreshold.mockImplementation(
      async (thresholdDays: number) =>
        thresholdDays === 0 ? [] : [{ record: buildRecord(), daysUntilExpiry: 25, thresholdDays }],
    );
    doctorAuthorityServiceMock.claimExpiryNotice.mockResolvedValue(true);

    await worker.sweepOnce();

    expect(doctorAuthorityServiceMock.claimExpiryNotice.mock.calls).toEqual([
      ['authority-1', 60],
      ['authority-1', 30],
    ]);
  });

  it('asks the service for candidates only — revoked and open-ended rows never reach it', async () => {
    // The exclusion lives in the repository query; the worker's contract is
    // that it notifies exactly what the service hands it and nothing else.
    doctorAuthorityServiceMock.claimExpiryNotice.mockResolvedValue(true);

    const actualRaised = await worker.sweepOnce();

    expect(actualRaised).toBe(0);
    expect(
      doctorAuthorityServiceMock.findAuthoritiesAtThreshold.mock.calls.map(([days]) => days),
    ).toEqual([60, 30, 0]);
  });

  it('refuses a non-numeric sweep interval at construction', () => {
    configServiceMock.get.mockImplementation((key: string) =>
      key === 'DOCTOR_AUTHORITY_EXPIRY_SWEEP_INTERVAL_MS' ? 'soon' : undefined,
    );

    expect(
      () =>
        new DoctorAuthorityExpiryWorker(
          doctorAuthorityServiceMock as unknown as DoctorAuthorityService,
          notificationServiceMock as unknown as NotificationService,
          configServiceMock as unknown as ConfigService,
        ),
    ).toThrow('DOCTOR_AUTHORITY_EXPIRY_SWEEP_INTERVAL_MS');
  });
});

import { DoctorLicenseExpiryRow } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { NotificationService } from '../../notification/service/notification.service';
import { DoctorLicenseExpiryService } from './doctor-license-expiry.service';
import { DoctorLicenseExpiryWorker } from './doctor-license-expiry.worker';

function buildRow(overrides: Partial<DoctorLicenseExpiryRow> = {}): DoctorLicenseExpiryRow {
  return {
    licenseId: 'license-1',
    doctorId: 'doctor-1',
    doctorName: 'dr. Rina Wijaya',
    type: 'SIP',
    licenseNumber: 'SIP-EXAMPLE-0001',
    issuedAt: '2021-03-12',
    expiresAt: '2026-10-03',
    daysUntilExpiry: 30,
    ...overrides,
  };
}

describe('DoctorLicenseExpiryWorker', () => {
  const doctorLicenseExpiryServiceMock = {
    findLicensesAtThreshold: jest.fn(),
    claimExpiryNotice: jest.fn(),
  };
  const notificationServiceMock = { createForUsersWithPermission: jest.fn() };
  const configServiceMock = { get: jest.fn() };
  let worker: DoctorLicenseExpiryWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    configServiceMock.get.mockReturnValue(undefined);
    doctorLicenseExpiryServiceMock.findLicensesAtThreshold.mockResolvedValue([]);
    notificationServiceMock.createForUsersWithPermission.mockResolvedValue(3);
    worker = new DoctorLicenseExpiryWorker(
      doctorLicenseExpiryServiceMock as unknown as DoctorLicenseExpiryService,
      notificationServiceMock as unknown as NotificationService,
      configServiceMock as unknown as ConfigService,
    );
  });

  it('notifies every administrator once for a licence expiring in 30 days', async () => {
    const inputRow = buildRow();
    doctorLicenseExpiryServiceMock.findLicensesAtThreshold.mockImplementation(
      async (thresholdDays: number) =>
        thresholdDays === 30 ? [{ row: inputRow, thresholdDays }] : [],
    );
    doctorLicenseExpiryServiceMock.claimExpiryNotice.mockResolvedValue(true);

    const actualRaised = await worker.sweepOnce();

    expect(actualRaised).toBe(3);
    expect(notificationServiceMock.createForUsersWithPermission).toHaveBeenCalledTimes(1);
    expect(notificationServiceMock.createForUsersWithPermission).toHaveBeenCalledWith(
      'doctor.license-expiry.read:any',
      expect.objectContaining({ type: 'LICENCE_EXPIRING' }),
    );
  });

  it('raises nothing on a second run the same day, because the notice is already claimed', async () => {
    doctorLicenseExpiryServiceMock.findLicensesAtThreshold.mockImplementation(
      async (thresholdDays: number) =>
        thresholdDays === 30 ? [{ row: buildRow(), thresholdDays }] : [],
    );
    doctorLicenseExpiryServiceMock.claimExpiryNotice.mockResolvedValue(false);

    const actualRaised = await worker.sweepOnce();

    expect(actualRaised).toBe(0);
    expect(notificationServiceMock.createForUsersWithPermission).not.toHaveBeenCalled();
  });

  it('sends the expired type once the date has passed', async () => {
    doctorLicenseExpiryServiceMock.findLicensesAtThreshold.mockImplementation(
      async (thresholdDays: number) =>
        thresholdDays === 0
          ? [{ row: buildRow({ daysUntilExpiry: -4, expiresAt: '2026-08-30' }), thresholdDays }]
          : [],
    );
    doctorLicenseExpiryServiceMock.claimExpiryNotice.mockResolvedValue(true);

    await worker.sweepOnce();

    expect(notificationServiceMock.createForUsersWithPermission).toHaveBeenCalledWith(
      'doctor.license-expiry.read:any',
      expect.objectContaining({ type: 'LICENCE_EXPIRED' }),
    );
  });

  it('carries no document reference in the notification payload', async () => {
    doctorLicenseExpiryServiceMock.findLicensesAtThreshold.mockImplementation(
      async (thresholdDays: number) =>
        thresholdDays === 30 ? [{ row: buildRow(), thresholdDays }] : [],
    );
    doctorLicenseExpiryServiceMock.claimExpiryNotice.mockResolvedValue(true);

    await worker.sweepOnce();

    const [, actualPayload] =
      notificationServiceMock.createForUsersWithPermission.mock.calls[0] ?? [];
    expect(Object.keys(actualPayload.params)).toEqual([
      'doctorName',
      'licenceType',
      'licenceNumber',
      'expiresAt',
      'daysUntilExpiry',
    ]);
  });

  it('skips a sweep that is already running rather than queueing a second pass', async () => {
    let releaseFirstSweep: (() => void) | undefined;
    doctorLicenseExpiryServiceMock.findLicensesAtThreshold
      .mockResolvedValue([])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstSweep = () => resolve([]);
          }),
      );

    const firstSweep = worker.sweepOnce();
    const actualSecondResult = await worker.sweepOnce();
    releaseFirstSweep?.();
    await firstSweep;

    expect(actualSecondResult).toBe(0);
  });
});

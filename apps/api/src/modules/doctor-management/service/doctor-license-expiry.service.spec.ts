import { DoctorLicenseExpiryRecord } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { DoctorLicenseExpiryRepository } from '../repository/doctor-license-expiry.repository';
import { DoctorLicenseExpiryService } from './doctor-license-expiry.service';

const CLINIC_TODAY = '2026-09-03T02:00:00.000Z';

function buildRecord(
  overrides: Partial<DoctorLicenseExpiryRecord> & { expiresAt: Date },
): DoctorLicenseExpiryRecord {
  return {
    licenseId: 'license-1',
    doctorId: 'doctor-1',
    doctorName: 'dr. Rina Wijaya',
    type: 'SIP',
    licenseNumber: 'SIP-EXAMPLE-0001',
    issuedAt: new Date('2021-03-12T00:00:00.000Z'),
    ...overrides,
  };
}

describe('DoctorLicenseExpiryService', () => {
  const doctorLicenseExpiryRepositoryMock = {
    listExpiringLicenses: jest.fn(),
    listExpiredLicensesForDoctors: jest.fn(),
    claimExpiryNotice: jest.fn(),
  };
  const configServiceMock = { get: jest.fn() };
  let service: DoctorLicenseExpiryService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date(CLINIC_TODAY));
    configServiceMock.get.mockReturnValue('Asia/Jakarta');
    service = new DoctorLicenseExpiryService(
      doctorLicenseExpiryRepositoryMock as unknown as DoctorLicenseExpiryRepository,
      configServiceMock as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getExpiryBuckets', () => {
    it('places each licence in the tightest bucket it qualifies for', async () => {
      const inputRecords: DoctorLicenseExpiryRecord[] = [
        buildRecord({ licenseId: 'lapsed', expiresAt: new Date('2026-08-20T00:00:00.000Z') }),
        buildRecord({ licenseId: 'soon', expiresAt: new Date('2026-09-30T00:00:00.000Z') }),
        buildRecord({ licenseId: 'medium', expiresAt: new Date('2026-10-25T00:00:00.000Z') }),
        buildRecord({ licenseId: 'wide', expiresAt: new Date('2026-11-25T00:00:00.000Z') }),
      ];
      doctorLicenseExpiryRepositoryMock.listExpiringLicenses.mockResolvedValue(inputRecords);

      const actualBuckets = await service.getExpiryBuckets();

      expect(actualBuckets.expired.map((row) => row.licenseId)).toEqual(['lapsed']);
      expect(actualBuckets.within30Days.map((row) => row.licenseId)).toEqual(['soon']);
      expect(actualBuckets.within60Days.map((row) => row.licenseId)).toEqual(['medium']);
      expect(actualBuckets.within90Days.map((row) => row.licenseId)).toEqual(['wide']);
    });

    it('counts days from the clinic calendar day, so an expiry today is not yet expired', async () => {
      doctorLicenseExpiryRepositoryMock.listExpiringLicenses.mockResolvedValue([
        buildRecord({ expiresAt: new Date('2026-09-03T00:00:00.000Z') }),
      ]);

      const actualBuckets = await service.getExpiryBuckets();

      expect(actualBuckets.expired).toHaveLength(0);
      expect(actualBuckets.within30Days[0]?.daysUntilExpiry).toBe(0);
    });

    it('exposes no document field on any row', async () => {
      doctorLicenseExpiryRepositoryMock.listExpiringLicenses.mockResolvedValue([
        buildRecord({ expiresAt: new Date('2026-09-30T00:00:00.000Z') }),
      ]);

      const actualBuckets = await service.getExpiryBuckets();

      const actualKeys = Object.keys(actualBuckets.within30Days[0] ?? {});
      expect(actualKeys).toEqual([
        'licenseId',
        'doctorId',
        'doctorName',
        'type',
        'licenseNumber',
        'issuedAt',
        'expiresAt',
        'daysUntilExpiry',
      ]);
      expect(actualKeys.some((key) => /document|file|scan|attachment/i.test(key))).toBe(false);
    });
  });

  describe('findExpiredLicensesByDoctor', () => {
    it('groups lapsed licences by doctor and lists both when STR and SIP have expired', async () => {
      doctorLicenseExpiryRepositoryMock.listExpiredLicensesForDoctors.mockResolvedValue([
        buildRecord({
          licenseId: 'str',
          type: 'STR',
          expiresAt: new Date('2026-07-01T00:00:00.000Z'),
        }),
        buildRecord({
          licenseId: 'sip',
          type: 'SIP',
          expiresAt: new Date('2026-08-20T00:00:00.000Z'),
        }),
      ]);

      const actualByDoctor = await service.findExpiredLicensesByDoctor(['doctor-1']);

      expect(actualByDoctor.get('doctor-1')?.map((row) => row.type)).toEqual(['STR', 'SIP']);
    });

    it('returns an empty map when no licence has lapsed', async () => {
      doctorLicenseExpiryRepositoryMock.listExpiredLicensesForDoctors.mockResolvedValue([]);

      const actualByDoctor = await service.findExpiredLicensesByDoctor(['doctor-1']);

      expect(actualByDoctor.size).toBe(0);
    });
  });
});

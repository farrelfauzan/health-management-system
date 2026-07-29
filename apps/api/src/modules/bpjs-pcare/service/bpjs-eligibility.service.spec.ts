import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { BpjsPcareError } from '../../../common/bpjs-pcare/bpjs-pcare.error';
import { BpjsEligibilityService } from './bpjs-eligibility.service';

describe('BpjsEligibilityService', () => {
  const mockActor = { sub: 'actor-user', email: 'admin@example.com' };
  const mockPatientId = '5b4a3c2d-1e0f-9a8b-7c6d-5e4f3a2b1c0d';
  const mockConnection = {
    environment: 'DEVELOPMENT',
    credentials: {
      consId: 'cons',
      secretKey: 'secret',
      userKey: 'user',
      pcareUsername: 'username',
      pcarePassword: 'password',
    },
  };
  const mockConfigRecord = { id: 'config-1', kdProviderPpk: '01000101' };
  const mockActiveMemberPayload = {
    nama: 'BUDI SANTOSO',
    aktif: true,
    ketAktif: 'AKTIF',
    jnsPeserta: { nama: 'PEKERJA PENERIMA UPAH' },
    jnsKelas: { nama: 'KELAS I' },
    kdProviderPst: { kdProvider: '01000101', nmProvider: 'KLINIK DEMO' },
    pstProl: '0',
    pstPrb: '0',
  };

  const eligibilityRepositoryMock = {
    findPatientLookupIdentifiers: jest.fn(),
    findCheckForDate: jest.fn(),
    upsertCheck: jest.fn(),
  };
  const configRepositoryMock = { findConfig: jest.fn(), getConnection: jest.fn() };
  const httpClientMock = { sendRequest: jest.fn() };
  const auditServiceMock = { record: jest.fn() };
  const configServiceMock = { get: jest.fn(() => 'Asia/Jakarta') };

  function createService(): BpjsEligibilityService {
    return new BpjsEligibilityService(
      eligibilityRepositoryMock as never,
      configRepositoryMock as never,
      httpClientMock as never,
      auditServiceMock as never,
      configServiceMock as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    eligibilityRepositoryMock.findPatientLookupIdentifiers.mockResolvedValue({
      patientId: mockPatientId,
      bpjsNumber: '0001234567890',
      nik: '3171234567890001',
    });
    eligibilityRepositoryMock.findCheckForDate.mockResolvedValue(null);
    eligibilityRepositoryMock.upsertCheck.mockImplementation((data: Record<string, unknown>) =>
      Promise.resolve({ id: 'check-1', ...data }),
    );
    configRepositoryMock.findConfig.mockResolvedValue(mockConfigRecord);
    configRepositoryMock.getConnection.mockResolvedValue(mockConnection);
    httpClientMock.sendRequest.mockResolvedValue({
      metaData: { code: '200', message: 'OK' },
      response: mockActiveMemberPayload,
    });
  });

  it('returns 404 when the patient does not exist', async () => {
    eligibilityRepositoryMock.findPatientLookupIdentifiers.mockResolvedValue(null);
    const service = createService();

    await expect(
      service.checkEligibility(mockPatientId, { force: false }, mockActor as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a patient with neither BPJS number nor NIK with a readable 400', async () => {
    eligibilityRepositoryMock.findPatientLookupIdentifiers.mockResolvedValue({
      patientId: mockPatientId,
      bpjsNumber: null,
      nik: null,
    });
    const service = createService();

    await expect(
      service.checkEligibility(mockPatientId, { force: false }, mockActor as never),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.checkEligibility(mockPatientId, { force: false }, mockActor as never),
    ).rejects.toThrow(/no BPJS number or NIK on file/);
  });

  it('performs the live lookup by BPJS number, caches it, and audits', async () => {
    const service = createService();

    const actualResult = await service.checkEligibility(
      mockPatientId,
      { force: false },
      mockActor as never,
    );

    expect(actualResult.state).toBe('ACTIVE');
    expect(actualResult.isFromCache).toBe(false);
    expect(actualResult.member).toMatchObject({
      name: 'BUDI SANTOSO',
      isRegisteredHere: true,
    });
    expect(httpClientMock.sendRequest).toHaveBeenCalledWith(
      mockConnection,
      expect.objectContaining({ path: 'peserta/0001234567890' }),
    );
    expect(eligibilityRepositoryMock.upsertCheck).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'ACTIVE', checkedVia: 'BPJS_NUMBER' }),
    );
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BPJS_ELIGIBILITY_CHECKED',
        resourceId: mockPatientId,
        metadata: { state: 'ACTIVE', checkedVia: 'BPJS_NUMBER', wasForced: false },
      }),
    );
  });

  it('falls back to the NIK lookup when no BPJS number is stored', async () => {
    eligibilityRepositoryMock.findPatientLookupIdentifiers.mockResolvedValue({
      patientId: mockPatientId,
      bpjsNumber: null,
      nik: '3171234567890001',
    });
    const service = createService();

    await service.checkEligibility(mockPatientId, { force: false }, mockActor as never);

    expect(httpClientMock.sendRequest).toHaveBeenCalledWith(
      mockConnection,
      expect.objectContaining({ path: 'peserta/nik/3171234567890001' }),
    );
    expect(eligibilityRepositoryMock.upsertCheck).toHaveBeenCalledWith(
      expect.objectContaining({ checkedVia: 'NIK' }),
    );
  });

  it('serves the day cache without an upstream call and skips force when asked', async () => {
    eligibilityRepositoryMock.findCheckForDate.mockResolvedValue({
      id: 'check-1',
      patientId: mockPatientId,
      checkedDate: new Date('2026-08-04T00:00:00.000Z'),
      outcome: 'ACTIVE',
      checkedVia: 'BPJS_NUMBER',
      memberName: 'BUDI SANTOSO',
      memberType: 'PEKERJA PENERIMA UPAH',
      memberClass: 'KELAS I',
      providerCode: '01000101',
      providerName: 'KLINIK DEMO',
      isRegisteredHere: true,
      isProlanis: false,
      isPrb: false,
      statusReason: 'AKTIF',
      checkedAt: new Date('2026-08-04T01:30:00.000Z'),
    });
    const service = createService();

    const cachedResult = await service.checkEligibility(
      mockPatientId,
      { force: false },
      mockActor as never,
    );
    const forcedResult = await service.checkEligibility(
      mockPatientId,
      { force: true },
      mockActor as never,
    );

    expect(cachedResult.isFromCache).toBe(true);
    expect(httpClientMock.sendRequest).toHaveBeenCalledTimes(1);
    expect(forcedResult.isFromCache).toBe(false);
  });

  it('settles an inactive member with BPJS’s readable reason', async () => {
    httpClientMock.sendRequest.mockResolvedValue({
      metaData: { code: '200', message: 'OK' },
      response: { ...mockActiveMemberPayload, aktif: false, ketAktif: 'PREMI BELUM DIBAYAR' },
    });
    const service = createService();

    const actualResult = await service.checkEligibility(
      mockPatientId,
      { force: false },
      mockActor as never,
    );

    expect(actualResult.state).toBe('INACTIVE');
    expect(actualResult.message).toContain('PREMI BELUM DIBAYAR');
  });

  it('settles a business rejection as a cached NOT_FOUND carrying the BPJS message', async () => {
    httpClientMock.sendRequest.mockRejectedValue(
      new BpjsPcareError(
        'BPJS_PCARE_REQUEST_REJECTED',
        'BPJS PCare rejected the request (code 201: Data tidak ditemukan)',
      ),
    );
    const service = createService();

    const actualResult = await service.checkEligibility(
      mockPatientId,
      { force: false },
      mockActor as never,
    );

    expect(actualResult.state).toBe('NOT_FOUND');
    expect(actualResult.message).toContain('Data tidak ditemukan');
    expect(eligibilityRepositoryMock.upsertCheck).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'NOT_FOUND' }),
    );
  });

  it('degrades a transport failure to an uncached UNREACHABLE state', async () => {
    httpClientMock.sendRequest.mockRejectedValue(
      new BpjsPcareError('BPJS_PCARE_TIMEOUT', 'BPJS PCare request timed out'),
    );
    const service = createService();

    const actualResult = await service.checkEligibility(
      mockPatientId,
      { force: false },
      mockActor as never,
    );

    expect(actualResult.state).toBe('UNREACHABLE');
    expect(actualResult.message).toContain('registration can proceed');
    expect(eligibilityRepositoryMock.upsertCheck).not.toHaveBeenCalled();
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ state: 'UNREACHABLE' }) }),
    );
  });

  it('returns 404 when BPJS is not configured and 503 when the key is missing', async () => {
    configRepositoryMock.findConfig.mockResolvedValue(null);
    const service = createService();
    await expect(
      service.checkEligibility(mockPatientId, { force: false }, mockActor as never),
    ).rejects.toThrow(NotFoundException);

    configRepositoryMock.findConfig.mockResolvedValue(mockConfigRecord);
    configRepositoryMock.getConnection.mockRejectedValue(
      new BpjsPcareError('BPJS_PCARE_NOT_CONFIGURED', 'encryption key missing'),
    );
    await expect(
      service.checkEligibility(mockPatientId, { force: false }, mockActor as never),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});

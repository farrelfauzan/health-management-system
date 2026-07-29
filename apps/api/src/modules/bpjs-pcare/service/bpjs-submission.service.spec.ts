import { BpjsSubmissionRecord, BpjsSubmissionSourceData } from '@hms/shared-types';

import { BpjsPcareError } from '../../../common/bpjs-pcare/bpjs-pcare.error';
import { BpjsSubmissionService } from './bpjs-submission.service';

describe('BpjsSubmissionService', () => {
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
  const mockMappedDoctor = {
    fullName: 'dr. Sinta Dewi',
    bpjsDoctorCode: '1234',
    bpjsPoliCode: '001',
  };

  function buildSubmission(overrides: Partial<BpjsSubmissionRecord> = {}): BpjsSubmissionRecord {
    return {
      id: 'submission-1',
      registrationId: 'registration-1',
      type: 'PENDAFTARAN',
      status: 'PENDING',
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date(),
      lastAttemptAt: null,
      submittedAt: null,
      bpjsReferenceNo: null,
      submittedKdPoli: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  function buildSourceData(
    overrides: Partial<BpjsSubmissionSourceData> = {},
  ): BpjsSubmissionSourceData {
    return {
      registration: {
        id: 'registration-1',
        status: 'CHECKED_IN',
        queueDate: new Date('2026-08-05T00:00:00.000Z'),
        checkedInAt: new Date('2026-08-05T02:00:00.000Z'),
      },
      patient: { bpjsNumber: '0001234567890' },
      appointmentDoctor: mockMappedDoctor,
      encounter: null,
      pendaftaran: null,
      ...overrides,
    };
  }

  const submissionRepositoryMock = {
    findSubmissionSourceData: jest.fn(),
    findRegistrationStatus: jest.fn(),
    enqueuePendaftaranDelete: jest.fn(),
    markSubmitted: jest.fn(),
    scheduleRetry: jest.fn(),
    markFailed: jest.fn(),
  };
  const configRepositoryMock = { findConfig: jest.fn(), getConnection: jest.fn() };
  const httpClientMock = { sendRequest: jest.fn() };
  const configServiceMock = { get: jest.fn(() => undefined) };

  function createService(): BpjsSubmissionService {
    return new BpjsSubmissionService(
      submissionRepositoryMock as never,
      configRepositoryMock as never,
      httpClientMock as never,
      configServiceMock as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    submissionRepositoryMock.findSubmissionSourceData.mockResolvedValue(buildSourceData());
    submissionRepositoryMock.findRegistrationStatus.mockResolvedValue('CHECKED_IN');
    configRepositoryMock.findConfig.mockResolvedValue(mockConfigRecord);
    configRepositoryMock.getConnection.mockResolvedValue(mockConnection);
    httpClientMock.sendRequest.mockResolvedValue({
      metaData: { code: '201', message: 'OK' },
      response: { message: 'A12' },
    });
  });

  describe('pendaftaran', () => {
    it('submits the visit registration and stores the reference and poli code', async () => {
      const service = createService();

      await service.processSubmission(buildSubmission());

      expect(httpClientMock.sendRequest).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          method: 'POST',
          path: 'pendaftaran',
          body: expect.objectContaining({
            kdProviderPeserta: '01000101',
            noKartu: '0001234567890',
            kdPoli: '001',
            tglDaftar: '05-08-2026',
            kdTkp: '10',
          }),
        }),
      );
      expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalledWith({
        id: 'submission-1',
        bpjsReferenceNo: 'A12',
        submittedKdPoli: '001',
      });
    });

    it('schedules a transient retry when a walk-in has no doctor yet', async () => {
      submissionRepositoryMock.findSubmissionSourceData.mockResolvedValue(
        buildSourceData({ appointmentDoctor: null, encounter: null }),
      );
      const service = createService();

      await service.processSubmission(buildSubmission());

      expect(submissionRepositoryMock.scheduleRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          attempts: 1,
          lastError: expect.stringContaining('no doctor yet'),
        }),
      );
      expect(submissionRepositoryMock.markFailed).not.toHaveBeenCalled();
      expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
    });

    it('fails permanently with a readable message when the specialty has no poli mapping', async () => {
      submissionRepositoryMock.findSubmissionSourceData.mockResolvedValue(
        buildSourceData({
          appointmentDoctor: { ...mockMappedDoctor, bpjsPoliCode: null },
        }),
      );
      const service = createService();

      await service.processSubmission(buildSubmission());

      expect(submissionRepositoryMock.markFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          lastError: expect.stringContaining('no BPJS poli mapping'),
        }),
      );
      expect(submissionRepositoryMock.scheduleRetry).not.toHaveBeenCalled();
    });

    it('fails permanently when the registration was cancelled before sending', async () => {
      submissionRepositoryMock.findSubmissionSourceData.mockResolvedValue(
        buildSourceData({
          registration: {
            id: 'registration-1',
            status: 'CANCELLED',
            queueDate: null,
            checkedInAt: new Date(),
          },
        }),
      );
      const service = createService();

      await service.processSubmission(buildSubmission());

      expect(submissionRepositoryMock.markFailed).toHaveBeenCalled();
      expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
    });

    it('enqueues the delete when the registration was cancelled mid-flight', async () => {
      submissionRepositoryMock.findRegistrationStatus.mockResolvedValue('CANCELLED');
      const service = createService();

      await service.processSubmission(buildSubmission());

      expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalled();
      expect(submissionRepositoryMock.enqueuePendaftaranDelete).toHaveBeenCalledWith(
        'registration-1',
      );
    });
  });

  describe('kunjungan', () => {
    const finishedEncounter = {
      id: 'encounter-1',
      status: 'FINISHED',
      endedAt: new Date('2026-08-05T04:00:00.000Z'),
      subjective: 'Demam tiga hari',
      doctor: mockMappedDoctor,
      vitals: {
        systolicBloodPressure: 120,
        diastolicBloodPressure: 80,
        heightCm: 170.4,
        weightKg: 65.6,
        pulseRate: 80,
        respiratoryRate: 18,
      },
      diagnoses: [
        { code: 'A01.0', type: 'PRIMARY' as const },
        { code: 'E11', type: 'SECONDARY' as const },
      ],
    };

    it('submits the encounter with ordered diagnoses and rounded vitals', async () => {
      submissionRepositoryMock.findSubmissionSourceData.mockResolvedValue(
        buildSourceData({
          encounter: finishedEncounter,
          pendaftaran: { status: 'SUBMITTED', bpjsReferenceNo: 'A12', submittedKdPoli: '002' },
        }),
      );
      httpClientMock.sendRequest.mockResolvedValue({
        metaData: { code: '201', message: 'OK' },
        response: { noKunjungan: '0001R0010826K000012' },
      });
      const service = createService();

      await service.processSubmission(buildSubmission({ type: 'KUNJUNGAN' }));

      expect(httpClientMock.sendRequest).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          method: 'POST',
          path: 'kunjungan',
          body: expect.objectContaining({
            kdDokter: '1234',
            kdPoli: '002',
            kdDiag1: 'A01.0',
            kdDiag2: 'E11',
            kdDiag3: null,
            beratBadan: 66,
            tinggiBadan: 170,
            tglPulang: '05-08-2026',
          }),
        }),
      );
      expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalledWith({
        id: 'submission-1',
        bpjsReferenceNo: '0001R0010826K000012',
        submittedKdPoli: '002',
      });
    });

    it('waits transiently while the pendaftaran is still pending', async () => {
      submissionRepositoryMock.findSubmissionSourceData.mockResolvedValue(
        buildSourceData({
          encounter: finishedEncounter,
          pendaftaran: { status: 'PENDING', bpjsReferenceNo: null, submittedKdPoli: null },
        }),
      );
      const service = createService();

      await service.processSubmission(buildSubmission({ type: 'KUNJUNGAN' }));

      expect(submissionRepositoryMock.scheduleRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          lastError: expect.stringContaining('Waiting for the visit pendaftaran'),
        }),
      );
      expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
    });

    it('fails permanently when the pendaftaran itself failed', async () => {
      submissionRepositoryMock.findSubmissionSourceData.mockResolvedValue(
        buildSourceData({
          encounter: finishedEncounter,
          pendaftaran: { status: 'FAILED', bpjsReferenceNo: null, submittedKdPoli: null },
        }),
      );
      const service = createService();

      await service.processSubmission(buildSubmission({ type: 'KUNJUNGAN' }));

      expect(submissionRepositoryMock.markFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          lastError: expect.stringContaining('pendaftaran failed'),
        }),
      );
    });

    it('fails permanently without a primary diagnosis', async () => {
      submissionRepositoryMock.findSubmissionSourceData.mockResolvedValue(
        buildSourceData({
          encounter: { ...finishedEncounter, diagnoses: [] },
          pendaftaran: { status: 'SUBMITTED', bpjsReferenceNo: 'A12', submittedKdPoli: '001' },
        }),
      );
      const service = createService();

      await service.processSubmission(buildSubmission({ type: 'KUNJUNGAN' }));

      expect(submissionRepositoryMock.markFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          lastError: expect.stringContaining('no primary diagnosis'),
        }),
      );
    });

    it('fails permanently when the doctor has no kdDokter mapping', async () => {
      submissionRepositoryMock.findSubmissionSourceData.mockResolvedValue(
        buildSourceData({
          encounter: {
            ...finishedEncounter,
            doctor: { ...mockMappedDoctor, bpjsDoctorCode: null },
          },
          pendaftaran: { status: 'SUBMITTED', bpjsReferenceNo: 'A12', submittedKdPoli: '001' },
        }),
      );
      const service = createService();

      await service.processSubmission(buildSubmission({ type: 'KUNJUNGAN' }));

      expect(submissionRepositoryMock.markFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          lastError: expect.stringContaining('no BPJS kdDokter mapping'),
        }),
      );
    });
  });

  describe('pendaftaran delete', () => {
    it('revokes the submitted pendaftaran with the stored reference and poli code', async () => {
      submissionRepositoryMock.findSubmissionSourceData.mockResolvedValue(
        buildSourceData({
          pendaftaran: { status: 'SUBMITTED', bpjsReferenceNo: 'A12', submittedKdPoli: '001' },
        }),
      );
      const service = createService();

      await service.processSubmission(buildSubmission({ type: 'PENDAFTARAN_DELETE' }));

      expect(httpClientMock.sendRequest).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          method: 'DELETE',
          path: 'pendaftaran/peserta/0001234567890/tglDaftar/05-08-2026/noUrut/A12/kdPoli/001',
        }),
      );
      expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalled();
    });

    it('fails permanently when the submitted pendaftaran has no stored reference', async () => {
      submissionRepositoryMock.findSubmissionSourceData.mockResolvedValue(
        buildSourceData({
          pendaftaran: { status: 'SUBMITTED', bpjsReferenceNo: null, submittedKdPoli: '001' },
        }),
      );
      const service = createService();

      await service.processSubmission(buildSubmission({ type: 'PENDAFTARAN_DELETE' }));

      expect(submissionRepositoryMock.markFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          lastError: expect.stringContaining('no PCare reference number'),
        }),
      );
    });
  });

  describe('failure classification', () => {
    it('schedules exponential backoff for transient transport failures', async () => {
      httpClientMock.sendRequest.mockRejectedValue(
        new BpjsPcareError('BPJS_PCARE_TIMEOUT', 'timed out'),
      );
      const service = createService();

      await service.processSubmission(buildSubmission({ attempts: 2 }));

      expect(submissionRepositoryMock.scheduleRetry).toHaveBeenCalledWith(
        expect.objectContaining({ attempts: 3 }),
      );
      const retryPayload = submissionRepositoryMock.scheduleRetry.mock.calls[0][0] as {
        nextAttemptAt: Date;
      };
      const delayMs = retryPayload.nextAttemptAt.getTime() - Date.now();
      expect(delayMs).toBeGreaterThan(200_000);
      expect(delayMs).toBeLessThanOrEqual(240_000);
    });

    it('fails permanently on a PCare business rejection', async () => {
      httpClientMock.sendRequest.mockRejectedValue(
        new BpjsPcareError(
          'BPJS_PCARE_REQUEST_REJECTED',
          'BPJS PCare rejected the request (code 412: Peserta bukan FKTP terdaftar)',
        ),
      );
      const service = createService();

      await service.processSubmission(buildSubmission());

      expect(submissionRepositoryMock.markFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          lastError: expect.stringContaining('Peserta bukan FKTP terdaftar'),
        }),
      );
    });

    it('fails permanently once the attempt budget is exhausted', async () => {
      httpClientMock.sendRequest.mockRejectedValue(
        new BpjsPcareError('BPJS_PCARE_UNAVAILABLE', 'upstream 503'),
      );
      const service = createService();

      await service.processSubmission(buildSubmission({ attempts: 7 }));

      expect(submissionRepositoryMock.markFailed).toHaveBeenCalledWith(
        expect.objectContaining({ attempts: 8 }),
      );
    });

    it('never rethrows a processing error', async () => {
      submissionRepositoryMock.findSubmissionSourceData.mockRejectedValue(
        new Error('database gone'),
      );
      const service = createService();

      await expect(service.processSubmission(buildSubmission())).resolves.toBeUndefined();
      expect(submissionRepositoryMock.scheduleRetry).toHaveBeenCalled();
    });
  });
});

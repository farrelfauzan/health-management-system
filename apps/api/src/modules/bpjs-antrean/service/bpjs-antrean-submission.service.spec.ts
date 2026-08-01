import { BpjsSubmissionSourceData } from '@hms/shared-types';

import { BpjsAntreanHttpClient } from '../../../common/bpjs-antrean/bpjs-antrean-http.client';
import { BpjsAntreanError } from '../../../common/bpjs-antrean/bpjs-antrean.error';
import { BpjsSubmissionDataError } from '../../bpjs-pcare/service/bpjs-submission-data.error';
import { BpjsAntreanConfigRepository } from '../repository/bpjs-antrean-config.repository';
import { BpjsAntreanSubmissionService } from './bpjs-antrean-submission.service';

const CONNECTION = {
  environment: 'DEVELOPMENT' as const,
  credentials: { consId: '20250042', secretKey: 'secret', userKey: 'user' },
};

function buildSourceData(
  overrides: Partial<BpjsSubmissionSourceData> = {},
): BpjsSubmissionSourceData {
  return {
    registration: {
      id: 'registration-1',
      status: 'CHECKED_IN',
      queueDate: new Date('2026-08-05T00:00:00.000Z'),
      checkedInAt: new Date('2026-08-05T01:30:00.000Z'),
    },
    patient: { bpjsNumber: '0001234567890' },
    appointmentDoctor: null,
    encounter: null,
    dispensedMedications: [],
    pendaftaran: null,
    kunjungan: null,
    antrean: {
      bpjsBookingCode: null,
      poliQueueNumber: 12,
      poliCode: '001',
      poliName: 'Umum',
      doctorCode: 'D01',
      doctorName: 'dr. Andi',
      practiceWindow: '08:00-12:00',
      sessionStart: new Date('2026-08-05T01:00:00.000Z'),
      medicalRecordNumber: '00000042',
      nationalIdentityNumber: '3201011234567890',
      phoneNumber: '081200000000',
    },
    antreanAdd: null,
    ...overrides,
  };
}

function buildService() {
  const httpClientMock = { sendRequest: jest.fn().mockResolvedValue({ metaData: {}, response: {} }) };
  const configRepositoryMock = { getConnection: jest.fn().mockResolvedValue(CONNECTION) };
  return {
    service: new BpjsAntreanSubmissionService(
      httpClientMock as unknown as BpjsAntreanHttpClient,
      configRepositoryMock as unknown as BpjsAntreanConfigRepository,
    ),
    httpClientMock,
    configRepositoryMock,
  };
}

describe('BpjsAntreanSubmissionService', () => {
  describe('ANTREAN_ADD', () => {
    it('publishes the walk-in’s queue entry with the allocated per-poli number', async () => {
      const { service, httpClientMock } = buildService();

      const actual = await service.submit('ANTREAN_ADD', buildSourceData());

      expect(httpClientMock.sendRequest).toHaveBeenCalledWith(
        CONNECTION,
        expect.objectContaining({ method: 'POST', path: 'antrean/add' }),
      );
      const sentBody = httpClientMock.sendRequest.mock.calls[0][1].body;
      // The number was allocated by the registration transaction (P14-T01);
      // re-deriving it here could publish one the clinic's display never shows.
      expect(sentBody.angkaantrean).toBe(12);
      expect(sentBody.tanggalperiksa).toBe('2026-08-05');
      expect(actual.submittedKdPoli).toBe('001');
      expect(actual.bpjsReferenceNo).toBe(sentBody.kodebooking);
    });

    it('refuses to republish a Mobile JKN booking', async () => {
      // The enqueue hook normally prevents this, but a row requeued by hand
      // from the monitor would reach here — and a duplicate queue entry lands
      // on the member's phone.
      const { service, httpClientMock } = buildService();

      await expect(
        service.submit(
          'ANTREAN_ADD',
          buildSourceData({
            antrean: { ...buildSourceData().antrean, bpjsBookingCode: 'BPJS-CODE-1' },
          }),
        ),
      ).rejects.toBeInstanceOf(BpjsSubmissionDataError);
      expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
    });

    it('refuses a cancelled registration', async () => {
      const { service, httpClientMock } = buildService();

      await expect(
        service.submit(
          'ANTREAN_ADD',
          buildSourceData({
            registration: { ...buildSourceData().registration, status: 'CANCELLED' },
          }),
        ),
      ).rejects.toBeInstanceOf(BpjsSubmissionDataError);
      expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
    });

    it.each([
      ['poliCode', 'poli'],
      ['doctorCode', 'kdDokter'],
      ['practiceWindow', 'session'],
      ['poliQueueNumber', 'antrian'],
      ['nationalIdentityNumber', 'NIK'],
    ])('fails permanently when %s is missing', async (field, expectedHint) => {
      // Missing mappings and missing identifiers are data errors: retrying
      // cannot fix them, and the message is what the monitor shows the admin.
      const { service } = buildService();
      const antrean = { ...buildSourceData().antrean, [field]: null };

      await expect(
        service.submit('ANTREAN_ADD', buildSourceData({ antrean })),
      ).rejects.toThrow(new RegExp(expectedHint));
    });
  });

  describe('ANTREAN_PANGGIL', () => {
    const encounter = {
      id: 'encounter-1',
      startedAt: new Date('2026-08-05T02:30:00.000Z'),
      status: 'IN_PROGRESS' as const,
      endedAt: null,
      subjective: null,
      doctor: null,
      vitals: null,
      diagnoses: [],
      referral: null,
    };

    it('reports the observed service start, not the drain time', async () => {
      // A row that waited out a BPJS outage must still report when the patient
      // was seen, or the dashboard reads as though every visit began the
      // moment the network came back.
      const { service, httpClientMock } = buildService();

      await service.submit(
        'ANTREAN_PANGGIL',
        buildSourceData({
          encounter,
          antreanAdd: { status: 'SUBMITTED', bpjsReferenceNo: 'code-1', submittedKdPoli: '001' },
        }),
      );

      const sentBody = httpClientMock.sendRequest.mock.calls[0][1].body;
      expect(sentBody.waktu).toBe(encounter.startedAt.getTime());
    });

    it('waits transiently while the queue entry is still pending', async () => {
      // Not a data error: the worker simply has not drained the add yet, and
      // the retry budget should wait rather than fail the row.
      const { service, httpClientMock } = buildService();

      const operation = service.submit(
        'ANTREAN_PANGGIL',
        buildSourceData({
          encounter,
          antreanAdd: { status: 'PENDING', bpjsReferenceNo: null, submittedKdPoli: null },
        }),
      );

      await expect(operation).rejects.not.toBeInstanceOf(BpjsSubmissionDataError);
      expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
    });

    it('fails permanently when the queue entry failed to publish', async () => {
      const { service } = buildService();

      await expect(
        service.submit(
          'ANTREAN_PANGGIL',
          buildSourceData({
            encounter,
            antreanAdd: { status: 'FAILED', bpjsReferenceNo: null, submittedKdPoli: null },
          }),
        ),
      ).rejects.toBeInstanceOf(BpjsSubmissionDataError);
    });

    it('addresses the poli the entry was published under, not the current one', async () => {
      // A poli reassignment after antrean/add would otherwise address the
      // follow-up at a queue BPJS never heard of.
      const { service, httpClientMock } = buildService();

      await service.submit(
        'ANTREAN_PANGGIL',
        buildSourceData({
          encounter,
          antrean: { ...buildSourceData().antrean, poliCode: '999' },
          antreanAdd: { status: 'SUBMITTED', bpjsReferenceNo: 'code-1', submittedKdPoli: '001' },
        }),
      );

      expect(httpClientMock.sendRequest.mock.calls[0][1].body.kodepoli).toBe('001');
    });
  });

  describe('ANTREAN_BATAL', () => {
    it('withdraws the published entry', async () => {
      const { service, httpClientMock } = buildService();

      await service.submit(
        'ANTREAN_BATAL',
        buildSourceData({
          registration: { ...buildSourceData().registration, status: 'CANCELLED' },
          antreanAdd: { status: 'SUBMITTED', bpjsReferenceNo: 'code-1', submittedKdPoli: '001' },
        }),
      );

      expect(httpClientMock.sendRequest).toHaveBeenCalledWith(
        CONNECTION,
        expect.objectContaining({ path: 'antrean/batal' }),
      );
      expect(httpClientMock.sendRequest.mock.calls[0][1].body.alasan.length).toBeGreaterThan(0);
    });
  });

  describe('failure classification', () => {
    it.each(['BPJS_ANTREAN_NOT_CONFIGURED', 'BPJS_ANTREAN_UNAUTHORIZED', 'BPJS_ANTREAN_REQUEST_REJECTED'] as const)(
      'treats %s as permanent',
      (code) => {
        const { service } = buildService();

        expect(service.isPermanentFailure(new BpjsAntreanError(code, 'failed'))).toBe(true);
      },
    );

    it.each(['BPJS_ANTREAN_TIMEOUT', 'BPJS_ANTREAN_UNAVAILABLE', 'BPJS_ANTREAN_CIRCUIT_OPEN'] as const)(
      'leaves %s to the retry budget',
      (code) => {
        // These are exactly what backoff exists for; failing them permanently
        // would drop a queue entry over a transient outage.
        const { service } = buildService();

        expect(service.isPermanentFailure(new BpjsAntreanError(code, 'failed'))).toBe(false);
      },
    );

    it('does not claim PCare failures', () => {
      const { service } = buildService();

      expect(service.isPermanentFailure(new Error('some other failure'))).toBe(false);
    });
  });

  it('treats a missing NIK as absent rather than crashing the send', async () => {
    // The shape of the P14-T05 regression that broke the PCare ops suite: a
    // nullable identifier arriving as absent rather than null must fail as a
    // readable data error, never as an opaque crypto TypeError — and above all
    // it must not be able to take down a submission for the *other*
    // integration that never reads the field.
    const { service } = buildService();
    const antrean = { ...buildSourceData().antrean, nationalIdentityNumber: null };

    await expect(service.submit('ANTREAN_ADD', buildSourceData({ antrean }))).rejects.toBeInstanceOf(
      BpjsSubmissionDataError,
    );
  });

  it('refuses to send when antrean is not configured', async () => {
    const { service, configRepositoryMock } = buildService();
    configRepositoryMock.getConnection.mockResolvedValue(null);

    await expect(service.submit('ANTREAN_ADD', buildSourceData())).rejects.toBeInstanceOf(
      BpjsAntreanError,
    );
  });
});

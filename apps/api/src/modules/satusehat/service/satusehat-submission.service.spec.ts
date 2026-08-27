import { SatusehatSubmissionRecord } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { SatusehatFhirMapper } from '../../../common/satusehat/satusehat-fhir.mapper';
import { SatusehatFhirTransactionBundle } from '../../../common/satusehat/satusehat-fhir.types';
import { SatusehatHttpClient } from '../../../common/satusehat/satusehat-http.client';
import { SatusehatMasterDataClient } from '../../../common/satusehat/satusehat-master-data.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { SatusehatLinkRepository } from '../repository/satusehat-link.repository';
import { SatusehatSubmissionRepository } from '../repository/satusehat-submission.repository';
import { SatusehatSubmissionService } from './satusehat-submission.service';

function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    SATUSEHAT_ORGANIZATION_ID: '10000004',
    SATUSEHAT_CLIENT_ID: 'client-id',
    SATUSEHAT_CLIENT_SECRET: 'client-secret',
    SATUSEHAT_LOCATION_ID: 'location-uuid',
    SATUSEHAT_SUBMISSION_MAX_ATTEMPTS: '3',
    SATUSEHAT_SUBMISSION_RETRY_BASE_DELAY_MS: '60000',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

const encounterId = 'e1d2c3b4-a596-4877-b8a9-c0d1e2f3a4b5';
const patientId = 'f5e4d3c2-b1a0-4918-a7b6-c5d4e3f2a1b0';
const doctorId = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

function buildSubmission(overrides: Partial<SatusehatSubmissionRecord> = {}): SatusehatSubmissionRecord {
  return {
    id: 'a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d',
    encounterId,
    status: 'PENDING',
    attempts: 0,
    lastError: null,
    nextAttemptAt: new Date('2026-07-28T03:00:00.000Z'),
    lastAttemptAt: null,
    submittedAt: null,
    satusehatEncounterId: null,
    createdAt: new Date('2026-07-28T03:00:00.000Z'),
    updatedAt: new Date('2026-07-28T03:00:00.000Z'),
    ...overrides,
  };
}

function buildBundleData(overrides: Record<string, unknown> = {}) {
  return {
    encounterId,
    encounterStatus: 'FINISHED' as const,
    patientId,
    patientName: 'Budi Santoso',
    patientIhsNumber: 'P02478375538',
    doctorId,
    doctorName: 'dr. Sari Wulandari',
    practitionerIhsNumber: 'N10000001',
    arrivedAt: new Date('2026-07-28T01:30:00.000Z'),
    startedAt: new Date('2026-07-28T02:00:00.000Z'),
    endedAt: new Date('2026-07-28T02:20:00.000Z'),
    diagnoses: [
      {
        code: 'A09',
        display: 'Diarrhoea and gastroenteritis',
        type: 'SECONDARY' as const,
        recordedAt: new Date('2026-07-28T02:05:00.000Z'),
      },
      {
        code: 'J06.9',
        display: 'Acute upper respiratory infection, unspecified',
        type: 'PRIMARY' as const,
        recordedAt: new Date('2026-07-28T02:10:00.000Z'),
      },
    ],
    latestVitalSigns: {
      recordedAt: new Date('2026-07-28T01:45:00.000Z'),
      heightCm: null,
      weightKg: 60.5,
      systolicBloodPressure: 120,
      diastolicBloodPressure: 80,
      pulseRate: null,
      respiratoryRate: null,
      temperatureCelsius: null,
      oxygenSaturation: null,
    },
    prescriptions: [],
    dispenseItems: [],
    ...overrides,
  };
}

const codedMedication = {
  medicationId: 'med-coded',
  code: 'PARA-500',
  kfaCode: '93001019',
  name: 'Paracetamol 500 mg Tablet',
  unit: 'TABLET',
};

const uncodedMedication = {
  medicationId: 'med-uncoded',
  code: 'RACIK-01',
  kfaCode: null,
  name: 'Puyer Racikan',
  unit: 'SACHET',
};

function buildPharmacyBundleData() {
  return buildBundleData({
    diagnoses: [],
    latestVitalSigns: null,
    prescriptions: [
      {
        prescriptionId: 'presc-1',
        issuedAt: new Date('2026-07-28T02:15:00.000Z'),
        items: [
          {
            prescriptionItemId: 'presc-item-1',
            prescriptionId: 'presc-1',
            medication: codedMedication,
            dosage: '500 mg',
            frequency: '3x sehari',
            instructions: 'Sesudah makan',
            quantity: 15,
          },
          {
            prescriptionItemId: 'presc-item-2',
            prescriptionId: 'presc-1',
            medication: uncodedMedication,
            dosage: '1 bungkus',
            frequency: '2x sehari',
            instructions: null,
            quantity: 10,
          },
        ],
      },
    ],
    dispenseItems: [
      {
        dispenseItemId: 'disp-item-1',
        dispenseRecordId: 'disp-1',
        prescriptionId: 'presc-1',
        medication: codedMedication,
        quantity: 15,
        dispensedAt: new Date('2026-07-28T02:30:00.000Z'),
      },
      {
        dispenseItemId: 'disp-item-2',
        dispenseRecordId: 'disp-1',
        prescriptionId: 'presc-1',
        medication: uncodedMedication,
        quantity: 10,
        dispensedAt: new Date('2026-07-28T02:30:00.000Z'),
      },
    ],
  });
}

describe('SatusehatSubmissionService', () => {
  const submissionRepositoryMock = {
    findDueSubmissions: jest.fn(),
    findBundleData: jest.fn(),
    markSubmitted: jest.fn(),
    scheduleRetry: jest.fn(),
    markFailed: jest.fn(),
  };
  const linkRepositoryMock = {
    findPatientLinkTarget: jest.fn(),
    savePatientIhsNumber: jest.fn(),
    findDoctorLinkTarget: jest.fn(),
    saveDoctorIhsNumber: jest.fn(),
  };
  const masterDataClientMock = {
    findPatientIhsNumberByNik: jest.fn(),
    findPractitionerIhsNumberByNik: jest.fn(),
  };
  const httpClientMock = {
    sendRequest: jest.fn(),
  };
  const auditServiceMock = {
    record: jest.fn(),
  };

  function buildService(): SatusehatSubmissionService {
    const configService = buildConfigService();
    return new SatusehatSubmissionService(
      configService,
      submissionRepositoryMock as unknown as SatusehatSubmissionRepository,
      linkRepositoryMock as unknown as SatusehatLinkRepository,
      masterDataClientMock as unknown as SatusehatMasterDataClient,
      new SatusehatFhirMapper(configService),
      httpClientMock as unknown as SatusehatHttpClient,
      auditServiceMock as unknown as AuditService,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submits a transaction bundle and records the returned IHS encounter id', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(buildBundleData());
    httpClientMock.sendRequest.mockResolvedValue({
      entry: [{ response: { status: '201 Created', location: 'Encounter/ihs-enc-1/_history/1' } }],
    });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    expect(httpClientMock.sendRequest).toHaveBeenCalledTimes(1);
    const sentRequest = httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      method: string;
      path: string;
      body: SatusehatFhirTransactionBundle;
    };
    expect(sentRequest.method).toBe('POST');
    expect(sentRequest.path).toBe('');
    const bundle = sentRequest.body;
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('transaction');
    expect(bundle.entry.map((entry) => entry.request.url)).toEqual([
      'Encounter',
      'Condition',
      'Condition',
      'Observation',
      'Observation',
      'Observation',
    ]);
    expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalledWith(
      buildSubmission().id,
      'ihs-enc-1',
    );
  });

  it('records the IHS encounter id when the platform answers with an absolute location URL', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(buildBundleData());
    httpClientMock.sendRequest.mockResolvedValue({
      entry: [
        {
          response: {
            status: '201 Created',
            location:
              'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/Encounter/ihs-enc-abs/_history/MTc4Nzg0MDExNzY2MDM4MTAwMA',
          },
        },
        {
          response: {
            status: '201 Created',
            location:
              'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/Condition/ihs-cond-abs/_history/MTc4Nzg0MDExNzY2MDM4MTAwMA',
          },
        },
      ],
    });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalledWith(
      buildSubmission().id,
      'ihs-enc-abs',
    );
  });

  it('records a null IHS encounter id when no entry carries an Encounter location', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(buildBundleData());
    httpClientMock.sendRequest.mockResolvedValue({
      entry: [
        {
          response: {
            status: '201 Created',
            location:
              'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/Condition/ihs-cond-only/_history/1',
          },
        },
      ],
    });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalledWith(buildSubmission().id, null);
  });

  it('wires every Condition and Observation to the Encounter entry fullUrl and ranks the primary first', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(buildBundleData());
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    const encounterEntry = bundle.entry[0];
    const encounterResource = encounterEntry?.resource as {
      diagnosis?: Array<{ condition: { reference: string }; rank: number }>;
    };
    const conditionEntries = bundle.entry.filter((entry) => entry.request.url === 'Condition');
    const observationEntries = bundle.entry.filter((entry) => entry.request.url === 'Observation');
    expect(encounterEntry?.fullUrl).toMatch(/^urn:uuid:/);
    for (const conditionEntry of conditionEntries) {
      const condition = conditionEntry.resource as { encounter: { reference: string } };
      expect(condition.encounter.reference).toBe(encounterEntry?.fullUrl);
    }
    for (const observationEntry of observationEntries) {
      const observation = observationEntry.resource as { encounter: { reference: string } };
      expect(observation.encounter.reference).toBe(encounterEntry?.fullUrl);
    }
    const primaryCondition = conditionEntries[0]?.resource as {
      code: { coding: Array<{ code: string }> };
    };
    expect(primaryCondition.code.coding[0]?.code).toBe('J06.9');
    expect(encounterResource.diagnosis?.[0]).toEqual({
      condition: { reference: conditionEntries[0]?.fullUrl },
      use: expect.objectContaining({}) as unknown,
      rank: 1,
    });
  });

  it('automatically links an unlinked patient by NIK before submitting', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({ patientIhsNumber: null }),
    );
    linkRepositoryMock.findPatientLinkTarget.mockResolvedValue({
      id: patientId,
      nik: '3204124101900002',
      hasSatusehatPatientId: false,
    });
    masterDataClientMock.findPatientIhsNumberByNik.mockResolvedValue('P02478375538');
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    expect(linkRepositoryMock.savePatientIhsNumber).toHaveBeenCalledWith({
      patientId,
      ihsNumber: 'P02478375538',
    });
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SATUSEHAT_PATIENT_LINKED',
        actorUserId: null,
        metadata: { lookup: 'NIK', trigger: 'SUBMISSION_WORKER' },
      }),
    );
    expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalled();
  });

  it('fails permanently when the patient has no NIK', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({ patientIhsNumber: null }),
    );
    linkRepositoryMock.findPatientLinkTarget.mockResolvedValue({
      id: patientId,
      nik: null,
      hasSatusehatPatientId: false,
    });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    expect(submissionRepositoryMock.markFailed).toHaveBeenCalledWith({
      id: buildSubmission().id,
      attempts: 1,
      lastError: expect.stringContaining('no NIK') as unknown as string,
    });
    expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
    expect(submissionRepositoryMock.scheduleRetry).not.toHaveBeenCalled();
  });

  it('fails permanently when the encounter is not finished', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({ encounterStatus: 'CANCELLED' }),
    );
    const service = buildService();

    await service.processSubmission(buildSubmission());

    expect(submissionRepositoryMock.markFailed).toHaveBeenCalled();
    expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
  });

  it('schedules an exponential-backoff retry on a transient upstream failure', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    submissionRepositoryMock.findBundleData.mockResolvedValue(buildBundleData());
    httpClientMock.sendRequest.mockRejectedValue(
      new SatusehatError('SATUSEHAT_UNAVAILABLE', 'upstream 503'),
    );
    const service = buildService();

    await service.processSubmission(buildSubmission({ attempts: 1 }));

    expect(submissionRepositoryMock.scheduleRetry).toHaveBeenCalledWith({
      id: buildSubmission().id,
      attempts: 2,
      nextAttemptAt: new Date(1_000_000 + 60_000 * 2),
      lastError: 'upstream 503',
    });
    expect(submissionRepositoryMock.markFailed).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it('parks the row FAILED once the attempt cap is reached', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(buildBundleData());
    httpClientMock.sendRequest.mockRejectedValue(
      new SatusehatError('SATUSEHAT_TIMEOUT', 'timed out'),
    );
    const service = buildService();

    await service.processSubmission(buildSubmission({ attempts: 2 }));

    expect(submissionRepositoryMock.markFailed).toHaveBeenCalledWith({
      id: buildSubmission().id,
      attempts: 3,
      lastError: 'timed out',
    });
    expect(submissionRepositoryMock.scheduleRetry).not.toHaveBeenCalled();
  });

  it('fails permanently on an upstream rejection without burning retries', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(buildBundleData());
    httpClientMock.sendRequest.mockRejectedValue(
      new SatusehatError('SATUSEHAT_REQUEST_REJECTED', 'validation failed', 400),
    );
    const service = buildService();

    await service.processSubmission(buildSubmission());

    expect(submissionRepositoryMock.markFailed).toHaveBeenCalledWith({
      id: buildSubmission().id,
      attempts: 1,
      lastError: 'validation failed',
    });
  });

  it('maps KFA-coded prescriptions and dispenses into Medication/MedicationRequest/MedicationDispense entries and skips uncoded items', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(buildPharmacyBundleData());
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    expect(bundle.entry.map((entry) => entry.request.url)).toEqual([
      'Encounter',
      'Medication',
      'MedicationRequest',
      'MedicationDispense',
    ]);
    const medicationEntry = bundle.entry[1];
    const medicationResource = medicationEntry?.resource as {
      code: { coding: Array<{ system: string; code: string }> };
      identifier: Array<{ system: string; value: string }>;
      extension: Array<{ url: string }>;
    };
    expect(medicationResource.code.coding[0]).toEqual(
      expect.objectContaining({ system: 'http://sys-ids.kemkes.go.id/kfa', code: '93001019' }),
    );
    expect(medicationResource.identifier[0]).toEqual(
      expect.objectContaining({
        system: 'http://sys-ids.kemkes.go.id/medication/10000004',
        value: 'PARA-500',
      }),
    );
    const requestEntry = bundle.entry[2];
    const requestResource = requestEntry?.resource as {
      medicationReference: { reference: string };
      encounter: { reference: string };
      requester: { reference: string };
      dosageInstruction: Array<{ text: string }>;
      substitution: { allowedBoolean: boolean };
    };
    expect(requestResource.medicationReference.reference).toBe(medicationEntry?.fullUrl);
    expect(requestResource.encounter.reference).toBe(bundle.entry[0]?.fullUrl);
    expect(requestResource.requester.reference).toBe('Practitioner/N10000001');
    expect(requestResource.dosageInstruction[0]?.text).toBe('500 mg, 3x sehari, Sesudah makan');
    expect(requestResource.substitution.allowedBoolean).toBe(false);
    const dispenseResource = bundle.entry[3]?.resource as {
      medicationReference: { reference: string };
      authorizingPrescription?: Array<{ reference: string }>;
      performer: Array<{ actor: { reference: string } }>;
      whenHandedOver: string;
      substitution: { wasSubstituted: boolean };
    };
    expect(dispenseResource.medicationReference.reference).toBe(medicationEntry?.fullUrl);
    expect(dispenseResource.authorizingPrescription?.[0]?.reference).toBe(requestEntry?.fullUrl);
    expect(dispenseResource.performer[0]?.actor.reference).toBe('Organization/10000004');
    expect(dispenseResource.whenHandedOver).toBe('2026-07-28T02:30:00.000Z');
    expect(dispenseResource.substitution.wasSubstituted).toBe(false);
  });

  it('logs only a count for catalog items skipped for a missing KFA code', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(buildPharmacyBundleData());
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();
    const warnSpy = jest.spyOn(
      (service as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn',
    );

    await service.processSubmission(buildSubmission());

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('skipped 1 item(s) without a KFA code'),
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('RACIK-01');
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('Puyer Racikan');
    warnSpy.mockRestore();
  });

  it('deduplicates the Medication entry when prescription and dispense share one catalog item', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(buildPharmacyBundleData());
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    const medicationCount = bundle.entry.filter(
      (entry) => entry.request.url === 'Medication',
    ).length;
    expect(medicationCount).toBe(1);
  });

  it('omits observation entries when the encounter recorded no vitals', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({ latestVitalSigns: null, diagnoses: [] }),
    );
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    expect(bundle.entry).toHaveLength(1);
    expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalledWith(
      buildSubmission().id,
      null,
    );
  });
});

import { SatusehatSubmissionRecord } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { SatusehatAmbiguousMatchError } from '../../../common/satusehat/satusehat-ambiguous-match.error';
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
    kind: 'ENCOUNTER',
    encounterId,
    labOrderId: null,
    labOrderNumber: null,
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
    admission: null,
    soapNote: {
      subjective: 'Batuk 3 hari',
      objective: 'Faring hiperemis',
      assessment: 'ISPA viral',
      plan: 'Kontrol 3 hari',
      prognosis: 'BONAM' as const,
    },
    procedures: [],
    immunizations: [],
    unreportedAllergies: [],
    retractedReportedAllergyCount: 0,
    prescriptions: [],
    dispenseItems: [],
    ...overrides,
  };
}

const labOrderId = '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e';
const labSpecimenId = '2f3a4b5c-6d7e-4f8a-9b0c-1d2e3f4a5b6c';

/**
 * A released order for two coded tests drawn into one serum tube, its
 * encounter already reported. Overrides shape the cases below.
 */
function buildLabBundleData(overrides: Record<string, unknown> = {}) {
  return {
    labOrderId,
    orderNumber: 'LAB/20260728/0042',
    orderStatus: 'RELEASED' as const,
    orderedAt: new Date('2026-07-28T02:05:00.000Z'),
    releasedAt: new Date('2026-07-28T04:30:00.000Z'),
    encounterId,
    satusehatEncounterId: 'ihs-enc-1',
    registrationId: '6c7d8e9f-0a1b-4c2d-8e3f-4a5b6c7d8e9f',
    visitStartedAt: new Date('2026-07-28T01:30:00.000Z'),
    patientId,
    patientName: 'Budi Santoso',
    patientIhsNumber: 'P02478375538',
    doctorId,
    doctorName: 'dr. Sari Wulandari',
    practitionerIhsNumber: 'N10000001',
    singlePanelLoincCode: null,
    singlePanelLoincDisplay: null,
    primaryConditionCode: 'E11.9',
    primaryConditionDisplay: 'Type 2 diabetes mellitus',
    specimens: [
      {
        specimenId: labSpecimenId,
        specimenType: 'SERUM' as const,
        accessionNumber: 'SPC/20260728/0007',
        collectedAt: new Date('2026-07-28T02:30:00.000Z'),
      },
    ],
    items: [
      {
        labOrderItemId: 'item-glucose',
        itemSeq: 1,
        testName: 'Glukosa Sewaktu',
        loincCode: '2345-7',
        loincDisplay: 'Glucose [Mass/volume] in Serum or Plasma',
        specimenId: labSpecimenId,
        result: {
          labResultId: 'result-glucose',
          valueNumeric: 142,
          valueText: null,
          valueCoded: null,
          unit: 'mg/dL',
          refLow: 70,
          refHigh: 100,
          refText: null,
          flag: 'HIGH' as const,
          isAmendment: false,
          enteredAt: new Date('2026-07-28T04:00:00.000Z'),
        },
      },
      {
        labOrderItemId: 'item-hba1c',
        itemSeq: 2,
        testName: 'HbA1c',
        loincCode: '4548-4',
        loincDisplay: 'Hemoglobin A1c',
        specimenId: labSpecimenId,
        result: {
          labResultId: 'result-hba1c',
          valueNumeric: 8.1,
          valueText: null,
          valueCoded: null,
          unit: '%',
          refLow: null,
          refHigh: 5.7,
          refText: null,
          flag: 'HIGH' as const,
          isAmendment: false,
          enteredAt: new Date('2026-07-28T04:05:00.000Z'),
        },
      },
    ],
    ...overrides,
  };
}

/**
 * A recorded transaction response for the chain above. Locations are absolute
 * URLs because that is what the live platform returns — the fixtures that use
 * relative ones let a parser pass here and fail in production.
 */
const LAB_CHAIN_RESPONSE = {
  entry: [
    resourceCreated('ServiceRequest', 'ihs-sr-1'),
    resourceCreated('ServiceRequest', 'ihs-sr-2'),
    resourceCreated('Specimen', 'ihs-spec-1'),
    resourceCreated('Observation', 'ihs-obs-1'),
    resourceCreated('Observation', 'ihs-obs-2'),
    resourceCreated('DiagnosticReport', 'ihs-dr-1'),
  ],
};

function resourceCreated(resourceType: string, id: string) {
  return {
    response: {
      status: '201 Created',
      location: `https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/${resourceType}/${id}/_history/1`,
    },
  };
}

const codedProcedure = {
  procedureId: 'proc-coded',
  code: '93.94',
  display: 'Respiratory medication administered by nebulizer',
  isCoded: true,
  performedAt: new Date('2026-07-28T02:12:00.000Z'),
  notes: 'Nebulisasi 10 menit',
};

const uncodedProcedure = {
  procedureId: 'proc-uncoded',
  code: 'RAWAT-LUKA',
  display: 'Rawat luka ringan',
  isCoded: false,
  performedAt: new Date('2026-07-28T02:14:00.000Z'),
  notes: null,
};

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
            compound: null,
            dosage: '500 mg',
            frequency: '3x sehari',
            instructions: 'Sesudah makan',
            quantity: 15,
          },
          {
            prescriptionItemId: 'presc-item-2',
            prescriptionId: 'presc-1',
            medication: uncodedMedication,
            compound: null,
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
        prescriptionItemId: null,
        quantity: 15,
        dispensedAt: new Date('2026-07-28T02:30:00.000Z'),
      },
      {
        dispenseItemId: 'disp-item-2',
        dispenseRecordId: 'disp-1',
        prescriptionId: 'presc-1',
        medication: uncodedMedication,
        prescriptionItemId: null,
        quantity: 10,
        dispensedAt: new Date('2026-07-28T02:30:00.000Z'),
      },
    ],
  });
}

describe('SatusehatSubmissionService', () => {
  const submissionRepositoryMock = {
    claimDueSubmissions: jest.fn(),
    findBundleData: jest.fn(),
    findLabReportBundleData: jest.fn(),
    saveAllergyIhsIds: jest.fn(),
    saveImmunizationIhsIds: jest.fn(),
    saveLabReportIhsIds: jest.fn(),
    saveSubmissionResources: jest.fn(),
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
      'ClinicalImpression',
      'Composition',
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

  it('records what the submission sent, with the id SATUSEHAT gave each resource', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({ latestVitalSigns: null }),
    );
    httpClientMock.sendRequest.mockResolvedValue({
      entry: [
        { response: { status: '201 Created', location: 'Encounter/ihs-enc-1/_history/1' } },
        { response: { status: '201 Created', location: 'Condition/ihs-cond-1/_history/1' } },
        { response: { status: '201 Created', location: 'Condition/ihs-cond-2/_history/1' } },
        { response: { status: '201 Created', location: 'ClinicalImpression/ihs-ci-1/_history/1' } },
        { response: { status: '201 Created', location: 'Composition/ihs-comp-1/_history/1' } },
      ],
    });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const saved = submissionRepositoryMock.saveSubmissionResources.mock.calls[0]?.[0] as {
      submissionId: string;
      resources: readonly {
        resourceType: string;
        outcome: string;
        skipReason: string | null;
        satusehatId: string | null;
        localRecordId: string | null;
      }[];
    };
    expect(saved.submissionId).toBe(buildSubmission().id);
    expect(saved.resources).toEqual([
      {
        resourceType: 'Encounter',
        outcome: 'SENT',
        skipReason: null,
        satusehatId: 'ihs-enc-1',
        localRecordId: encounterId,
        isBackfilled: false,
      },
      {
        resourceType: 'Condition',
        outcome: 'SENT',
        skipReason: null,
        satusehatId: 'ihs-cond-1',
        localRecordId: null,
        isBackfilled: false,
      },
      {
        resourceType: 'Condition',
        outcome: 'SENT',
        skipReason: null,
        satusehatId: 'ihs-cond-2',
        localRecordId: null,
        isBackfilled: false,
      },
      {
        resourceType: 'ClinicalImpression',
        outcome: 'SENT',
        skipReason: null,
        satusehatId: 'ihs-ci-1',
        localRecordId: null,
        isBackfilled: false,
      },
      {
        resourceType: 'Composition',
        outcome: 'SENT',
        skipReason: null,
        satusehatId: 'ihs-comp-1',
        localRecordId: null,
        isBackfilled: false,
      },
    ]);
  });

  it("records the ticket's example: two coded diagnoses sent and one medication skipped for no KFA code", async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        latestVitalSigns: null,
        prescriptions: [
          {
            prescriptionId: 'presc-1',
            prescribedAt: new Date('2026-07-28T02:15:00.000Z'),
            items: [
              {
                prescriptionItemId: 'presc-item-1',
                medication: {
                  medicationId: 'med-uncoded',
                  code: 'PARA500',
                  kfaCode: null,
                  name: 'Paracetamol 500 mg',
                  unit: 'tablet',
                },
                compound: null,
                dosageText: '3x1',
                quantity: 10,
              },
            ],
          },
        ],
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const saved = submissionRepositoryMock.saveSubmissionResources.mock.calls[0]?.[0] as {
      resources: readonly { resourceType: string; outcome: string; skipReason: string | null }[];
    };
    expect(saved.resources.filter((row) => row.resourceType === 'Condition')).toHaveLength(2);
    expect(saved.resources.filter((row) => row.outcome === 'SKIPPED')).toEqual([
      {
        resourceType: 'Medication',
        outcome: 'SKIPPED',
        skipReason: 'NO_KFA_CODE',
        satusehatId: null,
        localRecordId: null,
        isBackfilled: false,
      },
    ]);
  });

  it('records a skipped procedure without an ICD-9-CM code, and no clinical text with it', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        latestVitalSigns: null,
        procedures: [
          {
            procedureId: 'proc-uncoded',
            code: 'FREE_TEXT',
            display: 'Perawatan luka ringan',
            isCoded: false,
            performedAt: new Date('2026-07-28T02:12:00.000Z'),
            notes: null,
          },
        ],
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const saved = submissionRepositoryMock.saveSubmissionResources.mock.calls[0]?.[0] as {
      resources: readonly Record<string, unknown>[];
    };
    const skipped = saved.resources.filter((row) => row.outcome === 'SKIPPED');
    expect(skipped).toEqual([
      {
        resourceType: 'Procedure',
        outcome: 'SKIPPED',
        skipReason: 'NO_ICD9CM_CODE',
        satusehatId: null,
        localRecordId: null,
        isBackfilled: false,
      },
    ]);
    expect(JSON.stringify(saved.resources)).not.toContain('Perawatan luka ringan');
    expect(JSON.stringify(saved.resources)).not.toContain('FREE_TEXT');
  });

  it('keeps a null id on a sent resource whose type came back with a mismatched count', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({ latestVitalSigns: null }),
    );
    // Two Conditions were requested; the platform answers with one, so neither
    // id can be attributed and both rows keep a null id.
    httpClientMock.sendRequest.mockResolvedValue({
      entry: [
        { response: { status: '201 Created', location: 'Encounter/ihs-enc-1/_history/1' } },
        { response: { status: '201 Created', location: 'Condition/ihs-cond-only/_history/1' } },
      ],
    });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const saved = submissionRepositoryMock.saveSubmissionResources.mock.calls[0]?.[0] as {
      resources: readonly { resourceType: string; outcome: string; satusehatId: string | null }[];
    };
    const conditions = saved.resources.filter((row) => row.resourceType === 'Condition');
    expect(conditions).toHaveLength(2);
    expect(conditions.every((row) => row.outcome === 'SENT' && row.satusehatId === null)).toBe(true);
  });

  it('writes back the id SATUSEHAT assigned to an immunization', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        latestVitalSigns: null,
        diagnoses: [],
        immunizations: [
          {
            immunizationId: 'imm-1',
            kfaCode: '93000001',
            vaccineName: 'BCG',
            occurredAt: new Date('2026-07-28T02:05:00.000Z'),
            lotNumber: null,
            expirationDate: null,
            doseNumber: 1,
            route: 'IM' as const,
            site: 'LEFT_ARM' as const,
            notes: null,
          },
        ],
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({
      entry: [
        { response: { status: '201 Created', location: 'Encounter/ihs-enc-1/_history/1' } },
        { response: { status: '201 Created', location: 'Immunization/ihs-imm-1/_history/1' } },
        { response: { status: '201 Created', location: 'ClinicalImpression/ihs-ci-1/_history/1' } },
        { response: { status: '201 Created', location: 'Composition/ihs-comp-1/_history/1' } },
      ],
    });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    expect(submissionRepositoryMock.saveImmunizationIhsIds).toHaveBeenCalledWith([
      { immunizationId: 'imm-1', satusehatImmunizationId: 'ihs-imm-1' },
    ]);
  });

  it('leaves a submission reported when its resource list cannot be recorded', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({ latestVitalSigns: null }),
    );
    httpClientMock.sendRequest.mockResolvedValue({
      entry: [{ response: { status: '201 Created', location: 'Encounter/ihs-enc-1/_history/1' } }],
    });
    // `jest.clearAllMocks()` clears calls but keeps implementations, so this is
    // scoped to one call rather than leaking a rejection into later tests.
    submissionRepositoryMock.saveSubmissionResources.mockRejectedValueOnce(
      new Error('write failed'),
    );
    const service = buildService();

    await service.processSubmission(buildSubmission());

    // The bundle reached the platform and nothing can un-send it, so provenance
    // failing must not schedule a retry that would duplicate every resource.
    expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalledWith(
      buildSubmission().id,
      'ihs-enc-1',
    );
    expect(submissionRepositoryMock.scheduleRetry).not.toHaveBeenCalled();
    expect(submissionRepositoryMock.markFailed).not.toHaveBeenCalled();
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
      'ClinicalImpression',
      'Composition',
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

  it('adds an Immunization entry per KFA-coded vaccination and an Imunisasi section', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        diagnoses: [],
        latestVitalSigns: null,
        immunizations: [
          {
            immunizationId: 'imm-1',
            kfaCode: '93000123',
            vaccineName: 'Vaksin DPT-HB-Hib',
            occurredAt: new Date('2026-07-28T02:10:00.000Z'),
            lotNumber: 'LOT-DPT-2026-04',
            expirationDate: '2027-04-30',
            doseNumber: 3,
            route: 'IM' as const,
            site: 'LEFT_THIGH' as const,
            notes: null,
          },
        ],
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    const immunizationEntries = bundle.entry.filter(
      (entry) => entry.request.url === 'Immunization',
    );
    expect(immunizationEntries).toHaveLength(1);
    const composition = bundle.entry.at(-1)?.resource as {
      section: Array<{ title: string; entry?: Array<{ reference: string }> }>;
    };
    const immunisationSection = composition.section.find(
      (section) => section.title === 'Imunisasi',
    );
    expect(immunisationSection?.entry?.[0]?.reference).toBe(immunizationEntries[0]?.fullUrl);
  });

  it('skips a vaccine with no KFA code, keeps the rest, and logs the gap', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        diagnoses: [],
        latestVitalSigns: null,
        immunizations: [
          {
            immunizationId: 'imm-coded',
            kfaCode: '93000123',
            vaccineName: 'Vaksin DPT-HB-Hib',
            occurredAt: new Date('2026-07-28T02:10:00.000Z'),
            lotNumber: null,
            expirationDate: null,
            doseNumber: null,
            route: null,
            site: null,
            notes: null,
          },
          {
            immunizationId: 'imm-uncoded',
            kfaCode: null,
            vaccineName: 'Vaksin lokal tanpa KFA',
            occurredAt: new Date('2026-07-28T02:12:00.000Z'),
            lotNumber: null,
            expirationDate: null,
            doseNumber: null,
            route: null,
            site: null,
            notes: null,
          },
        ],
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();
    const warnSpy = jest.spyOn(
      (service as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn',
    );

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    expect(bundle.entry.filter((entry) => entry.request.url === 'Immunization')).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('skipped 1 vaccination(s) whose vaccine has no KFA code'),
    );
    warnSpy.mockRestore();
  });

  it('appends the Composition last, after every resource it references', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(buildBundleData());
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    const requestUrls = bundle.entry.map((entry) => entry.request.url);
    expect(requestUrls.at(-1)).toBe('Composition');
    expect(requestUrls).toContain('ClinicalImpression');
  });

  it('wires the Composition sections to the entries they summarise', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(buildBundleData());
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    const conditionFullUrls = bundle.entry
      .filter((entry) => entry.request.url === 'Condition')
      .map((entry) => entry.fullUrl);
    const composition = bundle.entry.at(-1)?.resource as {
      section: Array<{ title: string; entry?: Array<{ reference: string }> }>;
    };
    const diagnosisSection = composition.section.find((section) => section.title === 'Diagnosis');
    expect(diagnosisSection?.entry?.map((entry) => entry.reference)).toEqual(conditionFullUrls);
    expect(composition.section.map((section) => section.title)).not.toContain('Tindakan');
  });

  it('builds no Composition or ClinicalImpression for an encounter with nothing recorded', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        diagnoses: [],
        latestVitalSigns: null,
        soapNote: {
          subjective: null,
          objective: null,
          assessment: null,
          plan: null,
          prognosis: null,
        },
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    const requestUrls = bundle.entry.map((entry) => entry.request.url);
    expect(requestUrls).not.toContain('Composition');
    expect(requestUrls).not.toContain('ClinicalImpression');
  });

  it('reports an admitted visit as IMP over the admission period', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        diagnoses: [],
        latestVitalSigns: null,
        admission: {
          admissionId: 'adm-1',
          admittedAt: new Date('2026-07-28T02:30:00.000Z'),
          dischargedAt: new Date('2026-07-30T04:00:00.000Z'),
        },
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    const encounterResource = bundle.entry[0]?.resource as {
      class: { code: string };
      period: { start: string; end: string };
      hospitalization?: unknown;
    };
    expect(encounterResource.class.code).toBe('IMP');
    expect(encounterResource.period.end).toBe('2026-07-30T04:00:00.000Z');
    expect(encounterResource.hospitalization).toBeDefined();
  });

  it('appends unreported allergies and writes the returned ids back after a 201', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        diagnoses: [],
        latestVitalSigns: null,
        unreportedAllergies: [
          {
            allergyId: 'allergy-new',
            substance: 'Amoksisilin',
            reaction: 'Ruam',
            severity: 'SEVERE' as const,
            recordedAt: new Date('2026-07-28T02:05:00.000Z'),
          },
        ],
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({
      entry: [
        { response: { status: '201 Created', location: 'Encounter/ihs-enc-1/_history/1' } },
        {
          response: {
            status: '201 Created',
            location: 'AllergyIntolerance/ihs-allergy-1/_history/1',
          },
        },
      ],
    });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    expect(bundle.entry.filter((entry) => entry.request.url === 'AllergyIntolerance')).toHaveLength(
      1,
    );
    expect(submissionRepositoryMock.saveAllergyIhsIds).toHaveBeenCalledWith([
      { allergyId: 'allergy-new', satusehatAllergyId: 'ihs-allergy-1' },
    ]);
  });

  it('names the attending doctor as recorder only for an allergy taken down this visit', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        diagnoses: [],
        latestVitalSigns: null,
        unreportedAllergies: [
          {
            allergyId: 'allergy-this-visit',
            substance: 'Amoksisilin',
            reaction: null,
            severity: 'MILD' as const,
            recordedAt: new Date('2026-07-28T02:05:00.000Z'),
          },
          {
            allergyId: 'allergy-years-ago',
            substance: 'Udang',
            reaction: null,
            severity: 'MILD' as const,
            recordedAt: new Date('2024-01-01T00:00:00.000Z'),
          },
        ],
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    const allergyEntries = bundle.entry.filter(
      (entry) => entry.request.url === 'AllergyIntolerance',
    );
    const [thisVisit, yearsAgo] = allergyEntries.map(
      (entry) => entry.resource as { recorder?: { reference: string } },
    );
    expect(thisVisit?.recorder?.reference).toBe('Practitioner/N10000001');
    expect(yearsAgo?.recorder).toBeUndefined();
  });

  it('writes no allergy id back when the transaction did not confirm the entry', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        diagnoses: [],
        latestVitalSigns: null,
        unreportedAllergies: [
          {
            allergyId: 'allergy-new',
            substance: 'Amoksisilin',
            reaction: null,
            severity: 'MILD' as const,
            recordedAt: new Date('2026-07-28T02:05:00.000Z'),
          },
        ],
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    expect(submissionRepositoryMock.saveAllergyIhsIds).toHaveBeenCalledWith([]);
  });

  it('logs a gap when a reported allergy was retracted locally', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        diagnoses: [],
        latestVitalSigns: null,
        retractedReportedAllergyCount: 2,
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();
    const warnSpy = jest.spyOn(
      (service as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn',
    );

    await service.processSubmission(buildSubmission());

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('2 reported allergy(ies) were deleted locally'),
    );
    warnSpy.mockRestore();
  });

  it('parks an ambiguous NIK match FAILED without consuming an attempt', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({ patientIhsNumber: null }),
    );
    linkRepositoryMock.findPatientLinkTarget.mockResolvedValue({
      id: patientId,
      nik: '3204120101900001',
      hasSatusehatPatientId: false,
    });
    masterDataClientMock.findPatientIhsNumberByNik.mockRejectedValue(
      new SatusehatAmbiguousMatchError(2),
    );
    const service = buildService();

    await service.processSubmission(buildSubmission({ attempts: 1 }));

    expect(submissionRepositoryMock.markFailed).toHaveBeenCalledWith({
      id: buildSubmission().id,
      attempts: 1,
      lastError: 'more than one SATUSEHAT match (2) — verify in portal',
    });
    expect(submissionRepositoryMock.scheduleRetry).not.toHaveBeenCalled();
    expect(linkRepositoryMock.savePatientIhsNumber).not.toHaveBeenCalled();
    expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SATUSEHAT_LINK_AMBIGUOUS',
        resourceId: buildSubmission().id,
        actorUserId: null,
        metadata: expect.objectContaining({ trigger: 'SUBMISSION_WORKER', matchCount: 2 }),
      }),
    );
  });

  it('reports a racikan as one SD Medication with its components as ingredients', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        diagnoses: [],
        latestVitalSigns: null,
        prescriptions: [
          {
            prescriptionId: 'presc-1',
            issuedAt: new Date('2026-07-28T02:15:00.000Z'),
            items: [
              {
                prescriptionItemId: 'presc-item-compound',
                prescriptionId: 'presc-1',
                medication: null,
                compound: {
                  compoundName: 'Puyer batuk pilek',
                  preparation: 'PUYER' as const,
                  components: [
                    { medication: codedMedication, quantity: 0.5, unit: 'TABLET' },
                    {
                      medication: { ...codedMedication, medicationId: 'med-ctm', code: 'CTM-4', kfaCode: '93002020', name: 'CTM 4 mg' },
                      quantity: 0.25,
                      unit: 'TABLET',
                    },
                  ],
                },
                dosage: '1 bungkus',
                frequency: '3x sehari',
                instructions: null,
                quantity: 10,
              },
            ],
          },
        ],
        dispenseItems: [],
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    const medicationEntries = bundle.entry.filter((entry) => entry.request.url === 'Medication');
    // Two component products plus the compound itself.
    expect(medicationEntries).toHaveLength(3);
    const compoundResource = medicationEntries.at(-1)?.resource as {
      extension: Array<{ valueCodeableConcept: { coding: Array<{ code: string }> } }>;
      ingredient?: Array<{ itemReference: { reference: string } }>;
    };
    expect(compoundResource.extension[0]?.valueCodeableConcept.coding[0]?.code).toBe('SD');
    expect(compoundResource.ingredient).toHaveLength(2);
    expect(bundle.entry.filter((entry) => entry.request.url === 'MedicationRequest')).toHaveLength(
      1,
    );
  });

  it('skips a racikan whole when one component has no KFA code, and names both', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        diagnoses: [],
        latestVitalSigns: null,
        prescriptions: [
          {
            prescriptionId: 'presc-1',
            issuedAt: new Date('2026-07-28T02:15:00.000Z'),
            items: [
              {
                prescriptionItemId: 'presc-item-compound',
                prescriptionId: 'presc-1',
                medication: null,
                compound: {
                  compoundName: 'Puyer batuk pilek',
                  preparation: 'PUYER' as const,
                  components: [
                    { medication: codedMedication, quantity: 0.5, unit: 'TABLET' },
                    { medication: uncodedMedication, quantity: 0.25, unit: 'TABLET' },
                  ],
                },
                dosage: '1 bungkus',
                frequency: '3x sehari',
                instructions: null,
                quantity: 10,
              },
            ],
          },
        ],
        dispenseItems: [],
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();
    const warnSpy = jest.spyOn(
      (service as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn',
    );

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    // No compound entry, and no MedicationRequest for it either: a
    // half-described racikan is worse than an absent one.
    expect(bundle.entry.filter((entry) => entry.request.url === 'MedicationRequest')).toHaveLength(
      0,
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Puyer batuk pilek (RACIK-01)'),
    );
    warnSpy.mockRestore();
  });

  it('adds one Procedure entry per ICD-9-CM-coded procedure, wired to the Encounter entry', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        diagnoses: [],
        latestVitalSigns: null,
        procedures: [codedProcedure, { ...codedProcedure, procedureId: 'proc-coded-2' }],
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    const procedureEntries = bundle.entry.filter((entry) => entry.request.url === 'Procedure');
    expect(procedureEntries).toHaveLength(2);
    const procedureResource = procedureEntries[0]?.resource as {
      encounter: { reference: string };
      code: { coding: Array<{ code: string }> };
      performer?: Array<{ actor: { reference: string } }>;
    };
    expect(procedureResource.encounter.reference).toBe(bundle.entry[0]?.fullUrl);
    expect(procedureResource.code.coding[0]?.code).toBe('93.94');
    expect(procedureResource.performer?.[0]?.actor.reference).toBe('Practitioner/N10000001');
  });

  it('skips a free-text procedure, submits the rest, and names it in the gap log', async () => {
    submissionRepositoryMock.findBundleData.mockResolvedValue(
      buildBundleData({
        diagnoses: [],
        latestVitalSigns: null,
        procedures: [codedProcedure, uncodedProcedure],
      }),
    );
    httpClientMock.sendRequest.mockResolvedValue({ entry: [] });
    const service = buildService();
    const warnSpy = jest.spyOn(
      (service as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn',
    );

    await service.processSubmission(buildSubmission());

    const bundle = (httpClientMock.sendRequest.mock.calls[0]?.[0] as {
      body: SatusehatFhirTransactionBundle;
    }).body;
    expect(bundle.entry.filter((entry) => entry.request.url === 'Procedure')).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('skipped 1 procedure(s) without an ICD-9-CM code'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('RAWAT-LUKA (Rawat luka ringan)'),
    );
    warnSpy.mockRestore();
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
    expect(bundle.entry.filter((entry) => entry.request.url === 'Observation')).toHaveLength(0);
    expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalledWith(
      buildSubmission().id,
      null,
    );
  });
  describe('lab report submissions', () => {
    function buildLabSubmission(overrides: Record<string, unknown> = {}) {
      return buildSubmission({
        kind: 'LAB_REPORT',
        encounterId: null,
        labOrderId,
        labOrderNumber: 'LAB/20260728/0042',
        ...overrides,
      });
    }

    it('posts the whole chain in one transaction and writes every assigned id back', async () => {
      submissionRepositoryMock.findLabReportBundleData.mockResolvedValue(buildLabBundleData());
      httpClientMock.sendRequest.mockResolvedValue(LAB_CHAIN_RESPONSE);
      const service = buildService();

      await service.processSubmission(buildLabSubmission());

      expect(httpClientMock.sendRequest).toHaveBeenCalledTimes(1);
      const sentBundle = (
        httpClientMock.sendRequest.mock.calls[0]?.[0] as { body: SatusehatFhirTransactionBundle }
      ).body;
      expect(sentBundle.entry.map((entry) => entry.request.url)).toEqual([
        'ServiceRequest',
        'ServiceRequest',
        'Specimen',
        'Observation',
        'Observation',
        'DiagnosticReport',
      ]);
      // The chain is wired with bundle-local references, so the platform
      // resolves the links itself rather than needing a second round trip.
      const [firstRequest, , specimen, firstObservation, , report] = sentBundle.entry;
      expect((specimen?.resource as { request?: Array<{ reference: string }> }).request).toEqual([
        { reference: firstRequest?.fullUrl },
        { reference: sentBundle.entry[1]?.fullUrl },
      ]);
      expect(
        (firstObservation?.resource as { basedOn?: Array<{ reference: string }> }).basedOn,
      ).toEqual([{ reference: firstRequest?.fullUrl }]);
      expect(
        (firstObservation?.resource as { specimen?: { reference: string } }).specimen,
      ).toEqual({ reference: specimen?.fullUrl });
      expect((report?.resource as { result?: Array<{ reference: string }> }).result).toEqual([
        { reference: sentBundle.entry[3]?.fullUrl },
        { reference: sentBundle.entry[4]?.fullUrl },
      ]);
      expect(submissionRepositoryMock.saveLabReportIhsIds).toHaveBeenCalledWith({
        labOrderId,
        diagnosticReportId: 'ihs-dr-1',
        serviceRequestIdsByItemId: { 'item-glucose': 'ihs-sr-1', 'item-hba1c': 'ihs-sr-2' },
        specimenIdsBySpecimenId: { [labSpecimenId]: 'ihs-spec-1' },
        observationIdsByResultId: { 'result-glucose': 'ihs-obs-1', 'result-hba1c': 'ihs-obs-2' },
      });
      // A lab row records no IHS encounter of its own — it referenced one.
      expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalledWith(
        'a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d',
        null,
      );
    });

    it('sends a minimal Encounter of its own for a visit that had no consultation', async () => {
      submissionRepositoryMock.findLabReportBundleData.mockResolvedValue(
        buildLabBundleData({ encounterId: null, satusehatEncounterId: null }),
      );
      httpClientMock.sendRequest.mockResolvedValue({
        entry: [resourceCreated('Encounter', 'ihs-enc-walkin'), ...LAB_CHAIN_RESPONSE.entry],
      });
      const service = buildService();

      await service.processSubmission(buildLabSubmission());

      const sentBundle = (
        httpClientMock.sendRequest.mock.calls[0]?.[0] as { body: SatusehatFhirTransactionBundle }
      ).body;
      const encounterEntry = sentBundle.entry[0];
      expect(encounterEntry?.request.url).toBe('Encounter');
      const encounterResource = encounterEntry?.resource as {
        class: { code: string };
        participant?: unknown;
        serviceProvider: { reference: string };
        identifier: Array<{ value: string }>;
      };
      expect(encounterResource.class.code).toBe('AMB');
      // Nobody attended, and the national record should say so rather than
      // name a practitioner who never saw the patient.
      expect(encounterResource.participant).toBeUndefined();
      expect(encounterResource.serviceProvider.reference).toMatch(/^Organization\//);
      expect(encounterResource.identifier[0]?.value).toBe(
        '6c7d8e9f-0a1b-4c2d-8e3f-4a5b6c7d8e9f',
      );
      // And the rest of the chain points at it locally, not at a national id
      // that does not exist yet.
      const serviceRequest = sentBundle.entry.find(
        (entry) => entry.request.url === 'ServiceRequest',
      );
      expect((serviceRequest?.resource as { encounter: { reference: string } }).encounter).toEqual({
        reference: encounterEntry?.fullUrl,
      });
    });

    it('does not park a walk-in report for want of an encounter it never had', async () => {
      submissionRepositoryMock.findLabReportBundleData.mockResolvedValue(
        buildLabBundleData({ encounterId: null, satusehatEncounterId: null }),
      );
      httpClientMock.sendRequest.mockResolvedValue({
        entry: [resourceCreated('Encounter', 'ihs-enc-walkin'), ...LAB_CHAIN_RESPONSE.entry],
      });
      const service = buildService();

      await service.processSubmission(buildLabSubmission());

      expect(submissionRepositoryMock.markFailed).not.toHaveBeenCalled();
      expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalledTimes(1);
    });

    it('skips an uncoded test and a value the bench has not verified', async () => {
      submissionRepositoryMock.findLabReportBundleData.mockResolvedValue(
        buildLabBundleData({
          items: [
            {
              ...buildLabBundleData().items[0],
              labOrderItemId: 'item-uncoded',
              loincCode: null,
              loincDisplay: null,
            },
            {
              ...buildLabBundleData().items[1],
              labOrderItemId: 'item-unverified',
              result: null,
            },
            buildLabBundleData().items[0],
          ],
        }),
      );
      httpClientMock.sendRequest.mockResolvedValue(LAB_CHAIN_RESPONSE);
      const service = buildService();

      await service.processSubmission(buildLabSubmission());

      const sentBundle = (
        httpClientMock.sendRequest.mock.calls[0]?.[0] as { body: SatusehatFhirTransactionBundle }
      ).body;
      expect(sentBundle.entry.filter((entry) => entry.request.url === 'ServiceRequest')).toHaveLength(
        1,
      );
      expect(sentBundle.entry.filter((entry) => entry.request.url === 'Observation')).toHaveLength(1);
    });

    it('settles an order with nothing reportable without sending anything', async () => {
      submissionRepositoryMock.findLabReportBundleData.mockResolvedValue(
        buildLabBundleData({
          items: [{ ...buildLabBundleData().items[0], loincCode: null, loincDisplay: null }],
        }),
      );
      const service = buildService();

      await service.processSubmission(buildLabSubmission());

      expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
      // SUBMITTED, not FAILED: a catalog with no LOINC is not something a
      // retry can fix, and a permanent red row would say otherwise.
      expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalledTimes(1);
      expect(submissionRepositoryMock.markFailed).not.toHaveBeenCalled();
    });

    it('parks the row when the encounter it must reference was never reported', async () => {
      submissionRepositoryMock.findLabReportBundleData.mockResolvedValue(
        buildLabBundleData({ satusehatEncounterId: null }),
      );
      const service = buildService();

      await service.processSubmission(buildLabSubmission());

      expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
      expect(submissionRepositoryMock.markFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          lastError: expect.stringContaining('Encounter not reported to SATUSEHAT'),
        }),
      );
    });

    it('refuses to report an order that is not released', async () => {
      submissionRepositoryMock.findLabReportBundleData.mockResolvedValue(
        buildLabBundleData({ orderStatus: 'IN_PROGRESS', releasedAt: null }),
      );
      const service = buildService();

      await service.processSubmission(buildLabSubmission());

      expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
      expect(submissionRepositoryMock.markFailed).toHaveBeenCalledWith(
        expect.objectContaining({ lastError: expect.stringContaining('IN_PROGRESS') }),
      );
    });

    it('reports a corrected order as an amended report', async () => {
      const base = buildLabBundleData();
      submissionRepositoryMock.findLabReportBundleData.mockResolvedValue(
        buildLabBundleData({
          items: [{ ...base.items[0], result: { ...base.items[0]?.result, isAmendment: true } }],
        }),
      );
      httpClientMock.sendRequest.mockResolvedValue(LAB_CHAIN_RESPONSE);
      const service = buildService();

      await service.processSubmission(buildLabSubmission());

      const sentBundle = (
        httpClientMock.sendRequest.mock.calls[0]?.[0] as { body: SatusehatFhirTransactionBundle }
      ).body;
      const report = sentBundle.entry.find((entry) => entry.request.url === 'DiagnosticReport');
      expect((report?.resource as { status: string }).status).toBe('amended');
    });

    it('reports without a requester when the ordering doctor cannot be linked', async () => {
      submissionRepositoryMock.findLabReportBundleData.mockResolvedValue(
        buildLabBundleData({ practitionerIhsNumber: null }),
      );
      linkRepositoryMock.findDoctorLinkTarget.mockResolvedValue({ id: doctorId, nik: null });
      httpClientMock.sendRequest.mockResolvedValue(LAB_CHAIN_RESPONSE);
      const service = buildService();

      await service.processSubmission(buildLabSubmission());

      const sentBundle = (
        httpClientMock.sendRequest.mock.calls[0]?.[0] as { body: SatusehatFhirTransactionBundle }
      ).body;
      const serviceRequest = sentBundle.entry.find(
        (entry) => entry.request.url === 'ServiceRequest',
      );
      // An unlinkable requester costs the chain one element, not the whole
      // submission: the laboratory is the performer either way.
      expect((serviceRequest?.resource as { requester?: unknown }).requester).toBeUndefined();
      expect(submissionRepositoryMock.markSubmitted).toHaveBeenCalledTimes(1);
    });
  });
});

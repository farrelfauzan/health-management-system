import {
  SatusehatSubmissionBundleData,
  SatusehatSubmissionRecord,
  SatusehatSubmissionResourceRecord,
} from '@hms/shared-types';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { AuditContextService } from '../../../common/audit/audit-context.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { SatusehatHttpClient } from '../../../common/satusehat/satusehat-http.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { DoctorOwnProfileService } from '../../doctor-management/service/doctor-own-profile.service';
import { SATUSEHAT_READ_BACK_FIXTURES } from '../fixtures/satusehat-read-back-fixtures';
import { SatusehatSubmissionRepository } from '../repository/satusehat-submission.repository';
import { SatusehatRecordComparisonService } from './satusehat-record-comparison.service';

describe('SatusehatRecordComparisonService', () => {
  const TREATING_DOCTOR_ID = 'doctor-treating';
  const ENCOUNTER_ID = 'encounter-1';
  const PATIENT_ID = 'patient-1';

  const mockCurrentUser = { sub: 'user-doctor' } as CurrentUser;

  let mockRepository: {
    findBundleData: jest.Mock;
    findEncounterSubmission: jest.Mock;
    findSubmissionResources: jest.Mock;
    findEncounterLabOrderIds: jest.Mock;
    findSubmittedLabReportSubmissionIds: jest.Mock;
    findLabReportBundleData: jest.Mock;
  };
  let mockHttpClient: { sendRequest: jest.Mock };
  let mockDoctorOwnProfileService: { resolveOwnDoctorProfileId: jest.Mock };
  let mockAuditContextService: { setPatientId: jest.Mock };
  let service: SatusehatRecordComparisonService;

  function buildBundle(): SatusehatSubmissionBundleData {
    return {
      encounterId: ENCOUNTER_ID,
      encounterStatus: 'FINISHED',
      patientId: PATIENT_ID,
      patientName: 'Test Patient',
      patientIhsNumber: 'P000',
      doctorId: TREATING_DOCTOR_ID,
      doctorName: 'dr. Test',
      practitionerIhsNumber: 'N000',
      arrivedAt: new Date(),
      startedAt: new Date(),
      endedAt: new Date(),
      soapNote: {
        subjective: null,
        objective: null,
        assessment: null,
        plan: null,
        prognosis: null,
      },
      admission: null,
      diagnoses: [
        { code: 'A90', display: 'Dengue fever', type: 'PRIMARY', recordedAt: new Date() },
      ],
      procedures: [],
      immunizations: [],
      unreportedAllergies: [],
      retractedReportedAllergyCount: 0,
      latestVitalSigns: null,
      prescriptions: [
        {
          prescriptionId: 'rx-1',
          issuedAt: new Date(),
          items: [
            {
              prescriptionItemId: 'item-1',
              prescriptionId: 'rx-1',
              medication: {
                medicationId: 'med-1',
                code: 'OMZ',
                kfaCode: '93020847',
                name: 'Omeprazole',
                unit: null,
              },
              compound: null,
              dosage: '20 mg',
              frequency: '1x',
              instructions: null,
              quantity: 10,
            },
          ],
        },
      ],
      dispenseItems: [],
      encounterLocation: {
        specialtyName: null,
        specialtyLocationId: null,
        registeredRootLocationId: null,
      },
      antenatalVisit: null,
      postnatalVisit: null,
    } as SatusehatSubmissionBundleData;
  }

  function buildSubmission(
    status: SatusehatSubmissionRecord['status'] = 'SUBMITTED',
  ): SatusehatSubmissionRecord {
    return {
      id: 'submission-1',
      kind: 'ENCOUNTER',
      encounterId: ENCOUNTER_ID,
      labOrderId: null,
      pregnancyEpisodeId: null,
      labOrderNumber: null,
      status,
      attempts: 1,
      lastError: null,
      nextAttemptAt: new Date(),
      lastAttemptAt: new Date(),
      submittedAt: new Date(),
      satusehatEncounterId: 'ihs-enc-1',
      locationFallbackReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  function buildSent(
    resourceType: string,
    satusehatId: string | null,
  ): SatusehatSubmissionResourceRecord {
    return {
      resourceType,
      outcome: 'SENT',
      skipReason: null,
      satusehatId,
      localRecordId: null,
      isBackfilled: false,
    } as SatusehatSubmissionResourceRecord;
  }

  beforeEach(() => {
    mockRepository = {
      findBundleData: jest.fn().mockResolvedValue(buildBundle()),
      findEncounterSubmission: jest.fn().mockResolvedValue(buildSubmission()),
      findSubmissionResources: jest.fn().mockResolvedValue([]),
      findEncounterLabOrderIds: jest.fn().mockResolvedValue([]),
      findSubmittedLabReportSubmissionIds: jest.fn().mockResolvedValue([]),
      findLabReportBundleData: jest.fn().mockResolvedValue(null),
    };
    mockHttpClient = { sendRequest: jest.fn() };
    mockDoctorOwnProfileService = {
      resolveOwnDoctorProfileId: jest.fn().mockResolvedValue(TREATING_DOCTOR_ID),
    };
    mockAuditContextService = { setPatientId: jest.fn() };
    service = new SatusehatRecordComparisonService(
      mockRepository as unknown as SatusehatSubmissionRepository,
      mockHttpClient as unknown as SatusehatHttpClient,
      mockDoctorOwnProfileService as unknown as DoctorOwnProfileService,
      mockAuditContextService as unknown as AuditContextService,
    );
  });

  it('refuses a doctor who did not treat the patient before reading anything back', async () => {
    mockDoctorOwnProfileService.resolveOwnDoctorProfileId.mockResolvedValue('doctor-colleague');

    await expect(service.compareEncounterRecord(ENCOUNTER_ID, mockCurrentUser)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockAuditContextService.setPatientId).toHaveBeenCalledWith(PATIENT_ID);
    expect(mockHttpClient.sendRequest).not.toHaveBeenCalled();
  });

  it('answers 404 for an encounter that does not exist', async () => {
    mockRepository.findBundleData.mockResolvedValue(null);

    await expect(service.compareEncounterRecord(ENCOUNTER_ID, mockCurrentUser)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('reads nothing back for a visit that was never submitted', async () => {
    mockRepository.findEncounterSubmission.mockResolvedValue(buildSubmission('PENDING'));

    const actual = await service.compareEncounterRecord(ENCOUNTER_ID, mockCurrentUser);

    expect(actual).toMatchObject({ isSubmitted: false, hasResourceList: false });
    expect(mockRepository.findSubmissionResources).not.toHaveBeenCalled();
    expect(actual.lines.map((line) => line.outcome)).toEqual([
      'MISSING_ON_SATUSEHAT',
      'MISSING_ON_SATUSEHAT',
    ]);
  });

  it('reads back only compared resource types, by stored id, and matches what it finds', async () => {
    mockRepository.findSubmissionResources.mockResolvedValue([
      buildSent('Encounter', 'ihs-enc-1'),
      buildSent('Condition', 'ihs-cond-1'),
      buildSent('Medication', 'ihs-med-1'),
    ]);
    mockHttpClient.sendRequest.mockImplementation(({ path }: { path: string }) =>
      Promise.resolve(
        path.startsWith('/Condition')
          ? SATUSEHAT_READ_BACK_FIXTURES.Condition
          : SATUSEHAT_READ_BACK_FIXTURES.Medication,
      ),
    );

    const actual = await service.compareEncounterRecord(ENCOUNTER_ID, mockCurrentUser);

    expect(mockHttpClient.sendRequest.mock.calls.map(([call]) => call.path)).toEqual([
      '/Condition/ihs-cond-1',
      '/Medication/ihs-med-1',
    ]);
    expect(actual.lines.map((line) => line.outcome)).toEqual(['MATCHES', 'MATCHES']);
    expect(actual).toMatchObject({ hasResourceList: true, unreadableResourceCount: 0 });
  });

  it('counts failed reads and unpaired ids as unreadable, but a 404 as a real absence', async () => {
    mockRepository.findSubmissionResources.mockResolvedValue([
      buildSent('Condition', 'ihs-cond-gone'),
      buildSent('Medication', 'ihs-med-broken'),
      buildSent('Procedure', null),
    ]);
    mockHttpClient.sendRequest.mockImplementation(({ path }: { path: string }) =>
      Promise.reject(
        path.startsWith('/Condition')
          ? new SatusehatError('SATUSEHAT_REQUEST_REJECTED', 'not found', 404)
          : new SatusehatError('SATUSEHAT_UNAVAILABLE', 'unavailable', 503),
      ),
    );

    const actual = await service.compareEncounterRecord(ENCOUNTER_ID, mockCurrentUser);

    expect(actual.unreadableResourceCount).toBe(2);
    expect(actual.lines[0]).toMatchObject({ code: 'A90', outcome: 'MISSING_ON_SATUSEHAT' });
  });
  it('reads a lab report back ahead of the encounter and lines its result up by LOINC', async () => {
    mockRepository.findEncounterLabOrderIds.mockResolvedValue(['lab-order-1']);
    mockRepository.findLabReportBundleData.mockResolvedValue({
      items: [
        {
          labOrderItemId: 'item-1',
          itemSeq: 1,
          testName: 'Hemoglobin',
          loincCode: '718-7',
          loincDisplay: 'Hemoglobin',
          specimenId: 'specimen-1',
          result: {
            labResultId: 'result-1',
            valueNumeric: 13.2,
            valueText: null,
            valueCoded: null,
            unit: 'g/dL',
            refLow: null,
            refHigh: null,
            refText: null,
            flag: null,
            isAmendment: false,
            enteredAt: new Date(),
          },
        },
      ],
    });
    mockRepository.findSubmittedLabReportSubmissionIds.mockResolvedValue(['lab-submission-1']);
    mockRepository.findSubmissionResources.mockImplementation((submissionId: string) =>
      Promise.resolve(
        submissionId === 'lab-submission-1' ? [buildSent('Observation', 'ihs-obs-lab-1')] : [],
      ),
    );
    mockHttpClient.sendRequest.mockResolvedValue({
      resourceType: 'Observation',
      code: { coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }] },
      valueQuantity: { value: 13.2, unit: 'g/dL' },
    });

    const actual = await service.compareEncounterRecord(ENCOUNTER_ID, mockCurrentUser);

    expect(mockRepository.findLabReportBundleData).toHaveBeenCalledWith('lab-order-1');
    expect(actual.lines.find((line) => line.category === 'LAB_RESULT')).toMatchObject({
      code: '718-7',
      ours: '13.2 g/dL',
      satusehat: '13.2 g/dL',
      outcome: 'MATCHES',
    });
    expect(actual.hasResourceList).toBe(false);
  });
});

import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { SatusehatFhirMapper } from '../../../common/satusehat/satusehat-fhir.mapper';
import { SatusehatMasterDataClient } from '../../../common/satusehat/satusehat-master-data.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { PatientManagementRepository } from '../repository/patient-management.repository';
import { NewbornSatusehatNikService } from './newborn-satusehat-nik.service';

describe('NewbornSatusehatNikService', () => {
  const inputPatientId = 'patient-1';
  const inputActorUserId = 'user-1';
  const mockTarget = {
    ihsNumber: 'P0123456789',
    nik: '3201010101260001',
    fullName: 'Bayi Ny. Sari',
    birthDate: '2026-01-01',
  };

  function createService(overrides?: {
    target?: typeof mockTarget | null;
    patchError?: unknown;
  }) {
    const mockRepository = {
      findNewbornNikPatchTarget: jest
        .fn()
        .mockResolvedValue(overrides?.target === undefined ? mockTarget : overrides.target),
    } as unknown as PatientManagementRepository;
    const mockClient = {
      patchPatient:
        overrides?.patchError === undefined
          ? jest.fn().mockResolvedValue(undefined)
          : jest.fn().mockRejectedValue(overrides.patchError),
    } as unknown as SatusehatMasterDataClient;
    const mockAuditService = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const service = new NewbornSatusehatNikService(
      mockRepository,
      mockClient,
      new SatusehatFhirMapper({ get: jest.fn(() => undefined) } as unknown as ConfigService),
      mockAuditService,
    );
    return { service, mockRepository, mockClient, mockAuditService };
  }

  it('patches the patient the platform already holds and audits the send', async () => {
    const { service, mockClient, mockAuditService } = createService();

    const actual = await service.sendFirstNik(inputPatientId, inputActorUserId);

    expect(actual).toBeNull();
    expect(mockClient.patchPatient).toHaveBeenCalledWith('P0123456789', [
      {
        op: 'add',
        path: '/identifier/-',
        value: {
          system: 'https://fhir.kemkes.go.id/id/nik',
          use: 'official',
          value: '3201010101260001',
        },
      },
      { op: 'replace', path: '/name/0/text', value: 'Bayi Ny. Sari' },
      { op: 'replace', path: '/birthDate', value: '2026-01-01' },
    ]);
    expect(mockAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SATUSEHAT_PATIENT_NIK_PATCHED',
        resourceId: inputPatientId,
        metadata: { outcome: 'SENT', trigger: 'NEWBORN_FIRST_NIK' },
      }),
    );
  });

  it('never puts the NIK in the audit trail', async () => {
    const { service, mockAuditService } = createService();

    await service.sendFirstNik(inputPatientId, inputActorUserId);

    expect(JSON.stringify((mockAuditService.record as jest.Mock).mock.calls)).not.toContain(
      mockTarget.nik,
    );
  });

  it('returns the platform reason when Dukcapil refuses the NIK', async () => {
    const { service, mockAuditService } = createService({
      patchError: new SatusehatError('SATUSEHAT_REQUEST_REJECTED', 'NIK tidak sesuai Dukcapil'),
    });

    const actual = await service.sendFirstNik(inputPatientId, inputActorUserId);

    expect(actual).toContain('NIK tidak sesuai Dukcapil');
    expect(mockAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ outcome: 'REJECTED' }),
      }),
    );
  });

  it('reports an outage as unconfirmed rather than as a refusal', async () => {
    const { service, mockAuditService } = createService({
      patchError: new SatusehatError('SATUSEHAT_TIMEOUT', 'timed out'),
    });

    const actual = await service.sendFirstNik(inputPatientId, inputActorUserId);

    expect(actual).toContain('belum dapat dipastikan');
    expect(mockAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ outcome: 'UNCONFIRMED' }),
      }),
    );
  });

  it('does nothing when the patient is not a linked newborn with a NIK', async () => {
    const { service, mockClient, mockAuditService } = createService({ target: null });

    const actual = await service.sendFirstNik(inputPatientId, inputActorUserId);

    expect(actual).toBeNull();
    expect(mockClient.patchPatient).not.toHaveBeenCalled();
    expect(mockAuditService.record).not.toHaveBeenCalled();
  });
});

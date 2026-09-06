import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ClinicalDeliverySubjectRecord, DeliveryRecord } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { DocumentDeliveryRepository } from '../repository/document-delivery.repository';
import { DeliveryPasswordService } from './delivery-password.service';
import { PatientDeliveryConsentService } from './patient-delivery-consent.service';
import {
  DOCUMENT_NOT_RELEASED_CODE,
  PatientDocumentDeliveryService,
} from './patient-document-delivery.service';

const ACTOR = { sub: 'doctor-user', email: 'dokter@klinik.example' } as CurrentUser;
const DOCUMENT_ID = 'doc-1';

function buildSubject(
  overrides: Partial<ClinicalDeliverySubjectRecord['document']> = {},
  patient: Partial<ClinicalDeliverySubjectRecord['patient']> = {},
): ClinicalDeliverySubjectRecord {
  return {
    document: {
      id: DOCUMENT_ID,
      title: 'Hasil lab darah lengkap — HbA1c 9.2%',
      category: 'LAB_RESULT',
      documentDate: new Date('2026-09-25T00:00:00.000Z'),
      mimeType: 'application/pdf',
      storageKey: 'documents/patient/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf',
      patientId: 'patient-1',
      encounterId: 'encounter-1',
      releasedToPatient: true,
      isDeleted: false,
      ...overrides,
    },
    patient: {
      id: 'patient-1',
      mrn: 'MRN-1',
      fullName: 'Rina',
      dateOfBirth: new Date('1988-03-07T00:00:00.000Z'),
      phoneNumber: '0812',
      email: 'rina@example.test',
      ...patient,
    },
  };
}

function buildRow(overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return {
    id: 'delivery-1',
    patientId: 'patient-1',
    invoiceId: null,
    invoiceDocumentId: null,
    documentId: DOCUMENT_ID,
    channel: 'WHATSAPP',
    shape: 'ATTACHMENT',
    destinationMasked: '6281****0024',
    status: 'QUEUED',
    attemptCount: 0,
    sendAt: null,
    nextAttemptAt: null,
    leasedUntil: null,
    leasedBy: null,
    passwordSource: 'DOB_DDMMYYYY',
    providerMessageId: null,
    lastError: null,
    sentAt: null,
    openedAt: null,
    revokedAt: null,
    requestedBy: null,
    link: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PatientDocumentDeliveryService', () => {
  const configValues: Record<string, string> = {};
  const configService = { get: jest.fn((key: string) => configValues[key]) };
  const repositoryMock = {
    findClinicalDeliverySubject: jest.fn(),
    findByDocument: jest.fn(),
    createMany: jest.fn(),
  };
  const consentMock = { isDeliveryAllowed: jest.fn() };
  const passwordMock = { passwordSource: 'DOB_DDMMYYYY', assertPasswordAvailable: jest.fn() };
  const auditMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  function buildService(): PatientDocumentDeliveryService {
    return new PatientDocumentDeliveryService(
      configService as unknown as ConfigService,
      repositoryMock as unknown as DocumentDeliveryRepository,
      consentMock as unknown as PatientDeliveryConsentService,
      passwordMock as unknown as DeliveryPasswordService,
      auditMock as unknown as AuditService,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    delete configValues.DELIVERY_DISPATCH_DEFAULT_CATEGORIES;
    repositoryMock.findClinicalDeliverySubject.mockResolvedValue(buildSubject());
    repositoryMock.createMany.mockImplementation(
      async (entries: Array<{ channel: 'WHATSAPP' | 'EMAIL' }>) =>
        entries.map((entry, index) =>
          buildRow({ id: `delivery-${index + 1}`, channel: entry.channel }),
        ),
    );
    consentMock.isDeliveryAllowed.mockImplementation(async ({ channel }: { channel: string }) =>
      channel === 'WHATSAPP'
        ? {
            isAllowed: true,
            refusalReason: null,
            destination: {
              channel: 'WHATSAPP',
              externalChatId: '628@s.whatsapp.net',
              phoneNumber: '628',
            },
          }
        : { isAllowed: false, refusalReason: 'CONSENT_MISSING', destination: null },
    );
  });

  it('queues one attachment row per allowed channel and reports the refused ones', async () => {
    const actual = await buildService().requestDispatch(
      DOCUMENT_ID,
      { channels: ['WHATSAPP', 'EMAIL'] },
      ACTOR,
    );

    expect(actual.deliveries.map((row) => row.channel)).toEqual(['WHATSAPP']);
    expect(actual.refused).toEqual([{ channel: 'EMAIL', refusalReason: 'CONSENT_MISSING' }]);
    expect(repositoryMock.createMany).toHaveBeenCalledWith([
      expect.objectContaining({
        documentId: DOCUMENT_ID,
        invoiceId: null,
        invoiceDocumentId: null,
        shape: 'ATTACHMENT',
        passwordSource: 'DOB_DDMMYYYY',
        requestedById: 'doctor-user',
      }),
    ]);
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELIVERY_REQUESTED',
        actorUserId: 'doctor-user',
        metadata: expect.objectContaining({ documentId: DOCUMENT_ID, category: 'LAB_RESULT' }),
      }),
    );
  });

  it('refuses every channel when the patient has no date of birth, and writes nothing', async () => {
    passwordMock.assertPasswordAvailable.mockImplementation(() => {
      throw new UnprocessableEntityException('no dob');
    });

    const actual = await buildService().requestDispatch(
      DOCUMENT_ID,
      { channels: ['WHATSAPP', 'EMAIL'] },
      ACTOR,
    );

    expect(actual.deliveries).toEqual([]);
    expect(actual.refused).toEqual([
      { channel: 'WHATSAPP', refusalReason: 'DATE_OF_BIRTH_MISSING' },
      { channel: 'EMAIL', refusalReason: 'DATE_OF_BIRTH_MISSING' },
    ]);
    expect(repositoryMock.createMany).not.toHaveBeenCalled();
    passwordMock.assertPasswordAvailable.mockReset();
  });

  it('refuses a file that cannot become a locked PDF', async () => {
    repositoryMock.findClinicalDeliverySubject.mockResolvedValue(
      buildSubject({ mimeType: 'text/markdown' }),
    );

    const actual = await buildService().requestDispatch(
      DOCUMENT_ID,
      { channels: ['WHATSAPP'] },
      ACTOR,
    );

    expect(actual.refused).toEqual([
      { channel: 'WHATSAPP', refusalReason: 'FORMAT_NOT_DELIVERABLE' },
    ]);
    expect(repositoryMock.createMany).not.toHaveBeenCalled();
  });

  it('never dispatches an unreleased or retired document (FR-E4-26)', async () => {
    repositoryMock.findClinicalDeliverySubject.mockResolvedValueOnce(
      buildSubject({ releasedToPatient: false }),
    );
    repositoryMock.findClinicalDeliverySubject.mockResolvedValueOnce(
      buildSubject({ isDeleted: true }),
    );
    const service = buildService();

    const unreleased = await service
      .requestDispatch(DOCUMENT_ID, { channels: ['WHATSAPP'] }, ACTOR)
      .catch((err: unknown) => err);
    const retired = await service
      .requestDispatch(DOCUMENT_ID, { channels: ['WHATSAPP'] }, ACTOR)
      .catch((err: unknown) => err);

    expect(unreleased).toBeInstanceOf(UnprocessableEntityException);
    expect((unreleased as UnprocessableEntityException).getResponse()).toMatchObject({
      code: DOCUMENT_NOT_RELEASED_CODE,
    });
    expect(retired).toBeInstanceOf(UnprocessableEntityException);
    expect(repositoryMock.createMany).not.toHaveBeenCalled();
  });

  it('answers 404 for a document that is not a clinical file', async () => {
    repositoryMock.findClinicalDeliverySubject.mockResolvedValue(null);

    await expect(
      buildService().requestDispatch(DOCUMENT_ID, { channels: ['WHATSAPP'] }, ACTOR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reads the per-category default from configuration (FR-E4-28)', async () => {
    const withDefault = buildService();
    configValues.DELIVERY_DISPATCH_DEFAULT_CATEGORIES = 'CONSENT_FORM';
    const configured = buildService();
    repositoryMock.findByDocument.mockResolvedValue([buildRow({ status: 'SENT' })]);

    const timeline = await withDefault.listForDocument(DOCUMENT_ID);

    expect(withDefault.isDispatchByDefault('LAB_RESULT')).toBe(true);
    expect(withDefault.isDispatchByDefault('CONSENT_FORM')).toBe(false);
    expect(configured.isDispatchByDefault('LAB_RESULT')).toBe(false);
    expect(configured.isDispatchByDefault('CONSENT_FORM')).toBe(true);
    expect(timeline).toMatchObject({
      documentId: DOCUMENT_ID,
      category: 'LAB_RESULT',
      isDispatchByDefault: true,
    });
    expect(timeline.deliveries).toHaveLength(1);
  });
});

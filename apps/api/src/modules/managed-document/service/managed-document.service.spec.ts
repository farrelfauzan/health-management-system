import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  DocumentTypeRecord,
  ManagedDocumentAccessContext,
  ManagedDocumentRecord,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { AuditAction } from '../../../generated/prisma/client';
import { UploadedDocumentGuardService } from '../../document-management/service/uploaded-document-guard.service';
import { ManagedDocumentRepository } from '../repository/managed-document.repository';
import { DocumentTypeService } from './document-type.service';
import { ManagedDocumentAccessService } from './managed-document-access.service';
import { ManagedDocumentService } from './managed-document.service';

const ACTOR = { sub: 'user-1', email: 'admin@hms.local' } as CurrentUser;

const ACCESS: ManagedDocumentAccessContext = {
  userId: 'user-1',
  canReadInvoices: false,
  canReadTemplates: false,
  canReadClinicCorpus: false,
  canReadPatientDocuments: false,
};

const MANAGED_KEY = 'documents/managed/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf';

function buildType(overrides: Partial<DocumentTypeRecord> = {}): DocumentTypeRecord {
  return {
    id: 'type-1',
    code: 'LETTER',
    name: 'Surat',
    description: null,
    behavior: 'GENERIC',
    isSystem: true,
    isApprovalRequired: true,
    allowSelfApproval: false,
    requiredApprovals: 1,
    requiresPatient: false,
    requiresDoctor: false,
    contentMode: 'EITHER',
    isActive: true,
    sortOrder: 0,
    documentCount: 0,
    defaultApprovers: [],
    createdAt: new Date('2026-09-30T00:00:00Z'),
    updatedAt: new Date('2026-09-30T00:00:00Z'),
    ...overrides,
  };
}

function buildRecord(overrides: Partial<ManagedDocumentRecord> = {}): ManagedDocumentRecord {
  return {
    id: 'doc-1',
    typeId: 'type-1',
    type: {
      id: 'type-1',
      code: 'LETTER',
      name: 'Surat',
      behavior: 'GENERIC',
      contentMode: 'EITHER',
      requiresPatient: false,
      requiresDoctor: false,
      isActive: true,
    },
    status: 'DRAFT',
    title: 'Surat pengantar',
    documentNumber: null,
    contentHtml: '<p>Isi</p>',
    storageKey: null,
    storageMimeType: null,
    storageSizeBytes: null,
    patient: null,
    doctor: null,
    subjectTemplateId: null,
    subjectDocumentId: null,
    subjectInvoiceId: null,
    subjectDocument: null,
    draftedBy: { id: 'user-1', email: 'admin@hms.local' },
    issuedAt: null,
    createdAt: new Date('2026-09-30T02:00:00Z'),
    updatedAt: new Date('2026-09-30T02:00:00Z'),
    ...overrides,
  };
}

describe('ManagedDocumentService', () => {
  const repositoryMock = {
    listDocuments: jest.fn(),
    listDocumentsForExport: jest.fn(),
    findVisibleById: jest.fn(),
    createDocument: jest.fn(),
    updateDocument: jest.fn(),
    listHistory: jest.fn(),
    findPatientById: jest.fn(),
    findDoctorById: jest.fn(),
  };
  const accessServiceMock = { resolveContext: jest.fn() };
  const documentTypeServiceMock = { findActiveTypeOrThrow: jest.fn() };
  const objectStorageMock = { headObject: jest.fn(), getSignedUrl: jest.fn() };
  const uploadGuardMock = { guardUploadedDocument: jest.fn() };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  const service = new ManagedDocumentService(
    repositoryMock as unknown as ManagedDocumentRepository,
    accessServiceMock as unknown as ManagedDocumentAccessService,
    documentTypeServiceMock as unknown as DocumentTypeService,
    objectStorageMock as unknown as ObjectStorageService,
    uploadGuardMock as unknown as UploadedDocumentGuardService,
    auditServiceMock as unknown as AuditService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    accessServiceMock.resolveContext.mockResolvedValue(ACCESS);
    documentTypeServiceMock.findActiveTypeOrThrow.mockResolvedValue(buildType());
    repositoryMock.createDocument.mockImplementation(async (payload) =>
      buildRecord({ ...payload, id: 'doc-new', patient: null, doctor: null }),
    );
    repositoryMock.updateDocument.mockImplementation(async (payload) => buildRecord(payload));
    repositoryMock.findPatientById.mockResolvedValue({ id: 'patient-1' });
    repositoryMock.findDoctorById.mockResolvedValue({ id: 'doctor-1' });
    uploadGuardMock.guardUploadedDocument.mockImplementation(async () => ({ sizeBytes: 2048 }));
  });

  describe('createDocument', () => {
    it('sanitises drafted HTML and writes a DRAFT with no subject', async () => {
      const actual = await service.createDocument(
        {
          typeId: 'type-1',
          title: 'Surat pengantar',
          contentHtml: '<p>Isi</p><script>alert(1)</script><img src="x" onerror="x()">',
        },
        ACTOR,
      );

      expect(repositoryMock.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DRAFT',
          contentHtml: '<p>Isi</p><img>',
          storageKey: null,
          subjectTemplateId: null,
          subjectDocumentId: null,
          subjectInvoiceId: null,
          draftedById: 'user-1',
          issuedAt: null,
        }),
      );
      expect(actual.status).toBe('DRAFT');
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.CREATE, resourceId: 'doc-new' }),
      );
    });

    it('stores an empty draft as an empty string, never a NULL body', async () => {
      await service.createDocument({ typeId: 'type-1', title: 'Kosong' }, ACTOR);

      expect(repositoryMock.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ contentHtml: '', storageKey: null }),
      );
    });

    it('records an uploaded body from the stored object, and refuses a foreign key', async () => {
      objectStorageMock.headObject.mockResolvedValue({
        key: MANAGED_KEY,
        sizeBytes: 4096,
        contentType: 'application/pdf',
      });

      await service.createDocument(
        { typeId: 'type-1', title: 'Scan', storageKey: MANAGED_KEY },
        ACTOR,
      );
      const foreignKey = service.createDocument(
        {
          typeId: 'type-1',
          title: 'Scan',
          storageKey: 'documents/patient/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf',
        },
        ACTOR,
      );

      // The size on the row is the guard's, not the head's: an image is
      // re-encoded in place, so the stored object's length changes.
      expect(repositoryMock.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          contentHtml: null,
          storageKey: MANAGED_KEY,
          storageMimeType: 'application/pdf',
          storageSizeBytes: 2048,
        }),
      );
      expect(uploadGuardMock.guardUploadedDocument).toHaveBeenCalledWith({
        storageKey: MANAGED_KEY,
        declaredMimeType: 'application/pdf',
        actorUserId: 'user-1',
      });
      await expect(foreignKey).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a stored object whose type the store does not accept', async () => {
      objectStorageMock.headObject.mockResolvedValue({
        key: MANAGED_KEY,
        sizeBytes: 10,
        contentType: 'application/x-msdownload',
      });

      await expect(
        service.createDocument({ typeId: 'type-1', title: 'exe', storageKey: MANAGED_KEY }, ACTOR),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(uploadGuardMock.guardUploadedDocument).not.toHaveBeenCalled();
    });

    it('enforces the type’s party rules: required, and not allowed (FR-E5-35)', async () => {
      documentTypeServiceMock.findActiveTypeOrThrow.mockResolvedValue(
        buildType({ requiresPatient: true, requiresDoctor: true }),
      );
      const missingDoctor = await service
        .createDocument({ typeId: 'type-1', title: 'x', patientId: 'patient-1' }, ACTOR)
        .catch((err: unknown) => err);

      documentTypeServiceMock.findActiveTypeOrThrow.mockResolvedValue(buildType());
      const policyWithPatient = await service
        .createDocument({ typeId: 'type-1', title: 'x', patientId: 'patient-1' }, ACTOR)
        .catch((err: unknown) => err);

      expect(missingDoctor).toBeInstanceOf(UnprocessableEntityException);
      expect((missingDoctor as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'MANAGED_DOCUMENT_TYPE_RULE',
        errors: { issues: [{ code: 'DOCTOR_REQUIRED', field: 'doctorId' }] },
      });
      expect((policyWithPatient as UnprocessableEntityException).getResponse()).toMatchObject({
        errors: { issues: [{ code: 'PATIENT_NOT_ALLOWED', field: 'patientId' }] },
      });
      expect(repositoryMock.createDocument).not.toHaveBeenCalled();
    });

    it('enforces the content mode: DRAFTED refuses a file, UPLOADED demands one', async () => {
      documentTypeServiceMock.findActiveTypeOrThrow.mockResolvedValue(
        buildType({ contentMode: 'DRAFTED' }),
      );
      const draftedWithFile = await service
        .createDocument({ typeId: 'type-1', title: 'x', storageKey: MANAGED_KEY }, ACTOR)
        .catch((err: unknown) => err);

      documentTypeServiceMock.findActiveTypeOrThrow.mockResolvedValue(
        buildType({ contentMode: 'UPLOADED' }),
      );
      const uploadedWithoutFile = await service
        .createDocument({ typeId: 'type-1', title: 'x', contentHtml: '<p>x</p>' }, ACTOR)
        .catch((err: unknown) => err);

      expect((draftedWithFile as UnprocessableEntityException).getResponse()).toMatchObject({
        errors: { issues: [{ code: 'CONTENT_MUST_BE_DRAFTED', field: 'storageKey' }] },
      });
      expect((uploadedWithoutFile as UnprocessableEntityException).getResponse()).toMatchObject({
        errors: { issues: [{ code: 'CONTENT_MUST_BE_UPLOADED', field: 'storageKey' }] },
      });
      expect(repositoryMock.createDocument).not.toHaveBeenCalled();
    });

    it('answers 404 for a patient or doctor that does not exist', async () => {
      documentTypeServiceMock.findActiveTypeOrThrow.mockResolvedValue(
        buildType({ requiresPatient: true }),
      );
      repositoryMock.findPatientById.mockResolvedValue(null);

      await expect(
        service.createDocument({ typeId: 'type-1', title: 'x', patientId: 'ghost' }, ACTOR),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repositoryMock.createDocument).not.toHaveBeenCalled();
    });
  });

  describe('updateDocument', () => {
    it('refuses anything but a draft, and always a generated patient bill', async () => {
      repositoryMock.findVisibleById.mockResolvedValueOnce(buildRecord({ status: 'ISSUED' }));
      repositoryMock.findVisibleById.mockResolvedValueOnce(
        buildRecord({ type: { ...buildRecord().type, behavior: 'PATIENT_BILL' } }),
      );

      await expect(service.updateDocument('doc-1', { title: 'x' }, ACTOR)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.updateDocument('doc-1', { title: 'x' }, ACTOR)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repositoryMock.updateDocument).not.toHaveBeenCalled();
    });

    it('refuses an edit that would leave the row both drafted and uploaded', async () => {
      repositoryMock.findVisibleById.mockResolvedValue(buildRecord());

      await expect(
        service.updateDocument('doc-1', { storageKey: MANAGED_KEY }, ACTOR),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('switches a draft to an uploaded body when the HTML is cleared in the same request', async () => {
      repositoryMock.findVisibleById.mockResolvedValue(buildRecord());
      objectStorageMock.headObject.mockResolvedValue({
        key: MANAGED_KEY,
        sizeBytes: 512,
        contentType: 'image/png',
      });

      await service.updateDocument('doc-1', { contentHtml: null, storageKey: MANAGED_KEY }, ACTOR);

      expect(repositoryMock.updateDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          contentHtml: null,
          storageKey: MANAGED_KEY,
          storageMimeType: 'image/png',
          // The guard's size, not the head's: the PNG was re-encoded in place.
          storageSizeBytes: 2048,
        }),
      );
    });

    it('sanitises drafted HTML on every write and audits the field names only', async () => {
      repositoryMock.findVisibleById.mockResolvedValue(buildRecord());

      await service.updateDocument(
        'doc-1',
        { contentHtml: '<p onclick="x()">Ubah</p>', title: 'Baru' },
        ACTOR,
      );

      expect(repositoryMock.updateDocument).toHaveBeenCalledWith(
        expect.objectContaining({ contentHtml: '<p>Ubah</p>', title: 'Baru' }),
      );
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE,
          metadata: { changedFields: ['contentHtml', 'title'] },
        }),
      );
    });

    it('applies the type rules to the result of an edit, not the request alone', async () => {
      repositoryMock.findVisibleById.mockResolvedValue(
        buildRecord({
          type: { ...buildRecord().type, requiresPatient: true },
          patient: { id: 'patient-1', fullName: 'Rina' },
        }),
      );

      const actualError = await service
        .updateDocument('doc-1', { patientId: null }, ACTOR)
        .catch((err: unknown) => err);

      expect((actualError as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'MANAGED_DOCUMENT_TYPE_RULE',
        errors: { issues: [{ code: 'PATIENT_REQUIRED', field: 'patientId' }] },
      });
      expect(repositoryMock.updateDocument).not.toHaveBeenCalled();
    });

    it('reports a row outside the caller’s reach as not found', async () => {
      repositoryMock.findVisibleById.mockResolvedValue(null);

      await expect(service.updateDocument('doc-1', { title: 'x' }, ACTOR)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('listDocuments and export', () => {
    it('hands the resolved access context and the filters to the repository', async () => {
      repositoryMock.listDocuments.mockResolvedValue({ items: [buildRecord()], total: 1 });

      const actual = await service.listDocuments(
        {
          typeId: 'type-1',
          q: 'Rina',
          from: '2026-07-01',
          to: '2026-09-30',
          dateField: 'issued',
          page: 2,
          limit: 10,
        },
        ACTOR,
      );

      expect(repositoryMock.listDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          access: ACCESS,
          typeId: 'type-1',
          search: 'Rina',
          dateField: 'issued',
          from: new Date('2026-07-01T00:00:00.000Z'),
          to: new Date('2026-09-30T23:59:59.999Z'),
          page: 2,
          limit: 10,
        }),
      );
      expect(actual.meta).toEqual({ page: 2, limit: 10, total: 1 });
      expect(actual.items[0]).not.toHaveProperty('contentHtml');
    });

    it('exports metadata only and audits the export with the row count', async () => {
      repositoryMock.listDocumentsForExport.mockResolvedValue([buildRecord()]);

      const actual = await service.exportDocuments({ dateField: 'created' }, ACTOR);

      expect(actual.csv).not.toContain('<p>Isi</p>');
      expect(actual.csv).toContain('Surat pengantar');
      expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.EXPORT,
          metadata: expect.objectContaining({ rowCount: 1 }),
        }),
      );
    });
  });

  describe('getDownloadUrl', () => {
    it('signs an attachment download and audits it first', async () => {
      repositoryMock.findVisibleById.mockResolvedValue(
        buildRecord({
          contentHtml: null,
          storageKey: MANAGED_KEY,
          storageMimeType: 'application/pdf',
          storageSizeBytes: 2048,
        }),
      );
      objectStorageMock.getSignedUrl.mockResolvedValue({
        url: 'https://storage.test/get',
        expiresAt: '2026-09-30T02:10:00.000Z',
      });

      const actual = await service.getDownloadUrl('doc-1', ACTOR);

      expect(objectStorageMock.getSignedUrl).toHaveBeenCalledWith({
        key: MANAGED_KEY,
        responseContentDisposition: expect.stringMatching(
          /^attachment; filename="Surat pengantar\.pdf"/,
        ),
        responseContentType: 'application/pdf',
      });
      expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.READ,
          metadata: expect.objectContaining({ event: 'DOWNLOAD' }),
        }),
      );
      expect(actual.url).toBe('https://storage.test/get');
    });

    it('refuses a drafted document, which has no file', async () => {
      repositoryMock.findVisibleById.mockResolvedValue(buildRecord());

      await expect(service.getDownloadUrl('doc-1', ACTOR)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(objectStorageMock.getSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('returns the timestamps and the audit entries for a visible row', async () => {
      repositoryMock.findVisibleById.mockResolvedValue(buildRecord());
      repositoryMock.listHistory.mockResolvedValue([
        {
          id: 'audit-1',
          action: 'CREATE',
          actor: { id: 'user-1', email: 'admin@hms.local' },
          metadata: { typeCode: 'LETTER' },
          occurredAt: new Date('2026-09-30T02:00:00Z'),
        },
      ]);

      const actual = await service.getHistory('doc-1', ACTOR);

      expect(actual.entries).toEqual([
        {
          id: 'audit-1',
          action: 'CREATE',
          actor: { id: 'user-1', email: 'admin@hms.local' },
          metadata: { typeCode: 'LETTER' },
          occurredAt: '2026-09-30T02:00:00.000Z',
        },
      ]);
    });
  });
});

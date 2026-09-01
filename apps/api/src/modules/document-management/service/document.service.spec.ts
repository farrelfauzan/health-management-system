import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { DocumentRecord } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { DocumentRepository } from '../repository/document.repository';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { DocumentService } from './document.service';
import { UploadedDocumentGuardService } from './uploaded-document-guard.service';

const CLINIC_KEY = 'documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf';
const ACTOR: CurrentUser = { sub: 'a3c9b2e1-4d5f-4a6b-8c7d-9e0f1a2b3c4d', email: 'admin@hms.test' };

function buildDocumentRecord(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
    ownerType: 'CLINIC',
    ownerId: null,
    purpose: 'FAQ_KNOWLEDGE_BASE',
    title: 'SOP Pendaftaran',
    storageKey: CLINIC_KEY,
    mimeType: 'application/pdf',
    sizeBytes: 184320,
    visibility: 'BOTH',
    language: 'ID',
    ingestStatus: 'PENDING',
    ingestError: null,
    ingestedAt: null,
    chunkCount: 0,
    uploadedById: ACTOR.sub,
    patientId: null,
    encounterId: null,
    admissionId: null,
    category: null,
    documentDate: null,
    notes: null,
    releasedToPatient: false,
    releasedAt: null,
    releasedById: null,
    deleteReason: null,
    createdAt: new Date('2026-08-03T09:00:00.000Z'),
    updatedAt: new Date('2026-08-03T09:00:00.000Z'),
    ...overrides,
  };
}

function buildActorWithPermissions(
  permissions: ReadonlyArray<{ resource: string; action: string; scope: 'ANY' | 'OWN' }>,
) {
  return {
    id: ACTOR.sub,
    roles: [{ role: { permissions: permissions.map((permission) => ({ permission })) } }],
  };
}

const ANY_SCOPE_PERMISSIONS = [
  { resource: 'Document', action: 'read', scope: 'ANY' as const },
  { resource: 'Document', action: 'write', scope: 'ANY' as const },
];

const OWN_SCOPE_PERMISSIONS = [
  { resource: 'Document', action: 'read', scope: 'OWN' as const },
  { resource: 'Document', action: 'write', scope: 'OWN' as const },
];

describe('DocumentService', () => {
  let mockDocumentRepository: jest.Mocked<DocumentRepository>;
  let mockObjectStorageService: jest.Mocked<ObjectStorageService>;
  let mockAuthRepository: jest.Mocked<AuthRepository>;
  let mockUploadedDocumentGuardService: jest.Mocked<UploadedDocumentGuardService>;
  let documentService: DocumentService;

  beforeEach(() => {
    mockDocumentRepository = {
      createDocument: jest.fn(),
      findDocumentById: jest.fn(),
      listDocuments: jest.fn(),
      updateDocument: jest.fn(),
      softDeleteDocument: jest.fn(),
      markDocumentPending: jest.fn(),
    } as unknown as jest.Mocked<DocumentRepository>;
    mockObjectStorageService = {
      generateObjectKey: jest.fn().mockReturnValue(CLINIC_KEY),
      getSignedUploadUrl: jest.fn(),
      getSignedUrl: jest.fn(),
      headObject: jest.fn(),
    } as unknown as jest.Mocked<ObjectStorageService>;
    mockAuthRepository = {
      findUserById: jest.fn().mockResolvedValue(buildActorWithPermissions(ANY_SCOPE_PERMISSIONS)),
    } as unknown as jest.Mocked<AuthRepository>;
    mockUploadedDocumentGuardService = {
      guardUploadedDocument: jest.fn().mockResolvedValue({ sizeBytes: 999 }),
    } as unknown as jest.Mocked<UploadedDocumentGuardService>;
    documentService = new DocumentService(
      mockDocumentRepository,
      mockObjectStorageService,
      mockAuthRepository,
      mockUploadedDocumentGuardService,
    );
  });

  describe('createUploadUrl', () => {
    it('signs a server-minted clinic key with the declared type and size', async () => {
      mockObjectStorageService.getSignedUploadUrl.mockResolvedValue({
        url: 'https://storage.test/put',
        key: CLINIC_KEY,
        expiresAt: '2026-08-03T09:05:00.000Z',
        requiredHeaders: { 'Content-Type': 'application/pdf', 'Content-Length': '184320' },
      });

      const actualView = await documentService.createUploadUrl(
        { mimeType: 'application/pdf', sizeBytes: 184320 },
        ACTOR,
      );

      expect(mockObjectStorageService.generateObjectKey).toHaveBeenCalledWith({
        keyPrefix: 'documents/clinic',
        fileExtension: 'pdf',
      });
      expect(mockObjectStorageService.getSignedUploadUrl).toHaveBeenCalledWith({
        key: CLINIC_KEY,
        contentType: 'application/pdf',
        contentLengthBytes: 184320,
      });
      expect(actualView.storageKey).toBe(CLINIC_KEY);
    });

    it('persists nothing, so an unused signed URL leaves no document behind', async () => {
      mockObjectStorageService.getSignedUploadUrl.mockResolvedValue({
        url: 'https://storage.test/put',
        key: CLINIC_KEY,
        expiresAt: '2026-08-03T09:05:00.000Z',
        requiredHeaders: {},
      });

      await documentService.createUploadUrl({ mimeType: 'text/markdown', sizeBytes: 4096 }, ACTOR);

      expect(mockDocumentRepository.createDocument).not.toHaveBeenCalled();
    });
  });

  describe('confirmUpload', () => {
    const CONFIRM_INPUT = {
      storageKey: CLINIC_KEY,
      title: 'SOP Pendaftaran',
      purpose: 'FAQ_KNOWLEDGE_BASE' as const,
      visibility: 'BOTH' as const,
      language: 'ID' as const,
    };

    it('takes the MIME type from the stored object and the size from the guard, never from the request', async () => {
      // The guard is the authority on size because it may have replaced the
      // object: an image is re-encoded in place, so the length the head
      // reported is the length of bytes that are no longer there.
      mockObjectStorageService.headObject.mockResolvedValue({
        key: CLINIC_KEY,
        sizeBytes: 4096,
        contentType: 'text/markdown',
      });
      mockDocumentRepository.createDocument.mockResolvedValue(buildDocumentRecord());

      await documentService.confirmUpload(CONFIRM_INPUT, ACTOR);

      expect(mockDocumentRepository.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ sizeBytes: 999, mimeType: 'text/markdown' }),
      );
    });

    it('runs the confirm-time content gate against the stored object (SJ-21)', async () => {
      mockObjectStorageService.headObject.mockResolvedValue({
        key: CLINIC_KEY,
        sizeBytes: 2048,
        contentType: 'application/pdf',
      });
      mockDocumentRepository.createDocument.mockResolvedValue(buildDocumentRecord());

      await documentService.confirmUpload(CONFIRM_INPUT, ACTOR);

      expect(mockUploadedDocumentGuardService.guardUploadedDocument).toHaveBeenCalledWith({
        storageKey: CLINIC_KEY,
        declaredMimeType: 'application/pdf',
        actorUserId: ACTOR.sub,
      });
    });

    it('writes no row when the content gate rejects the bytes (SJ-21)', async () => {
      mockObjectStorageService.headObject.mockResolvedValue({
        key: CLINIC_KEY,
        sizeBytes: 2048,
        contentType: 'application/pdf',
      });
      mockUploadedDocumentGuardService.guardUploadedDocument.mockRejectedValue(
        new BadRequestException('File does not begin with the PDF signature its upload declared'),
      );

      await expect(documentService.confirmUpload(CONFIRM_INPUT, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockDocumentRepository.createDocument).not.toHaveBeenCalled();
    });

    it('refuses a storage key this module never minted, without reading the object', async () => {
      const actualError = await documentService
        .confirmUpload(
          { ...CONFIRM_INPUT, storageKey: 'patients/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.jpg' },
          ACTOR,
        )
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(BadRequestException);
      // Reading first would already leak whether an object exists at a key
      // the caller guessed, so the shape check has to come first.
      expect(mockObjectStorageService.headObject).not.toHaveBeenCalled();
      expect(mockDocumentRepository.createDocument).not.toHaveBeenCalled();
    });

    it('refuses a stored object of a type no document surface accepts', async () => {
      mockObjectStorageService.headObject.mockResolvedValue({
        key: CLINIC_KEY,
        sizeBytes: 2048,
        contentType: 'application/zip',
      });

      await expect(documentService.confirmUpload(CONFIRM_INPUT, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockDocumentRepository.createDocument).not.toHaveBeenCalled();
    });

    it('accepts an image but never queues it for ingestion (P16-T03)', async () => {
      // HMS runs no OCR, so a photographed page carries no text for retrieval
      // to find. `PENDING` would queue it for a worker that can only mark it
      // `FAILED` — a red row for a file doing exactly what it was uploaded to
      // do.
      mockObjectStorageService.headObject.mockResolvedValue({
        key: CLINIC_KEY,
        sizeBytes: 2048,
        contentType: 'image/jpeg',
      });
      mockDocumentRepository.createDocument.mockResolvedValue(buildDocumentRecord());

      await documentService.confirmUpload(CONFIRM_INPUT, ACTOR);

      expect(mockDocumentRepository.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: 'image/jpeg',
          // FAQ_KNOWLEDGE_BASE is an ingestible purpose; the type overrides it.
          purpose: 'FAQ_KNOWLEDGE_BASE',
          ingestStatus: 'NOT_APPLICABLE',
        }),
      );
    });

    it('refuses a stored object larger than the surface cap', async () => {
      mockObjectStorageService.headObject.mockResolvedValue({
        key: CLINIC_KEY,
        sizeBytes: 32 * 1024 * 1024,
        contentType: 'image/jpeg',
      });

      await expect(documentService.confirmUpload(CONFIRM_INPUT, ACTOR)).rejects.toThrow(
        'larger than the permitted size',
      );
      expect(mockUploadedDocumentGuardService.guardUploadedDocument).not.toHaveBeenCalled();
      expect(mockDocumentRepository.createDocument).not.toHaveBeenCalled();
    });

    it('refuses an empty stored object', async () => {
      mockObjectStorageService.headObject.mockResolvedValue({
        key: CLINIC_KEY,
        sizeBytes: 0,
        contentType: 'application/pdf',
      });

      await expect(documentService.confirmUpload(CONFIRM_INPUT, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('reports a missing upload as a request problem rather than a missing endpoint', async () => {
      mockObjectStorageService.headObject.mockRejectedValue(
        new NotFoundException('Stored object not found'),
      );

      await expect(documentService.confirmUpload(CONFIRM_INPUT, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rests a knowledge-base document at PENDING and a general one at NOT_APPLICABLE', async () => {
      mockObjectStorageService.headObject.mockResolvedValue({
        key: CLINIC_KEY,
        sizeBytes: 184320,
        contentType: 'application/pdf',
      });
      mockDocumentRepository.createDocument.mockResolvedValue(buildDocumentRecord());

      await documentService.confirmUpload(CONFIRM_INPUT, ACTOR);
      await documentService.confirmUpload({ ...CONFIRM_INPUT, purpose: 'GENERAL' }, ACTOR);

      expect(mockDocumentRepository.createDocument).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ ingestStatus: 'PENDING' }),
      );
      expect(mockDocumentRepository.createDocument).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ ingestStatus: 'NOT_APPLICABLE' }),
      );
    });

    it('writes the clinic corpus, never a personal one', async () => {
      mockObjectStorageService.headObject.mockResolvedValue({
        key: CLINIC_KEY,
        sizeBytes: 184320,
        contentType: 'application/pdf',
      });
      mockDocumentRepository.createDocument.mockResolvedValue(buildDocumentRecord());

      await documentService.confirmUpload(CONFIRM_INPUT, ACTOR);

      expect(mockDocumentRepository.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ ownerType: 'CLINIC', ownerId: null, uploadedById: ACTOR.sub }),
      );
    });

    it('reports a replayed confirm as a conflict rather than creating a second document', async () => {
      mockObjectStorageService.headObject.mockResolvedValue({
        key: CLINIC_KEY,
        sizeBytes: 184320,
        contentType: 'application/pdf',
      });
      mockDocumentRepository.createDocument.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      await expect(documentService.confirmUpload(CONFIRM_INPUT, ACTOR)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('never returns the storage key on the created document', async () => {
      mockObjectStorageService.headObject.mockResolvedValue({
        key: CLINIC_KEY,
        sizeBytes: 184320,
        contentType: 'application/pdf',
      });
      mockDocumentRepository.createDocument.mockResolvedValue(buildDocumentRecord());

      const actualView = await documentService.confirmUpload(CONFIRM_INPUT, ACTOR);

      expect(actualView).not.toHaveProperty('storageKey');
    });
  });

  describe('listDocuments', () => {
    it('pins the query to the clinic corpus so no personal knowledge base can appear', async () => {
      mockDocumentRepository.listDocuments.mockResolvedValue({ items: [], nextCursor: null });

      await documentService.listDocuments({ limit: 20 }, ACTOR);

      expect(mockDocumentRepository.listDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ ownerType: 'CLINIC', ownerId: null }),
      );
    });
  });

  describe('getDownloadUrl', () => {
    it('signs attachment disposition and the stored type into the URL (SJ-21)', async () => {
      mockDocumentRepository.findDocumentById.mockResolvedValue(buildDocumentRecord());
      mockObjectStorageService.getSignedUrl.mockResolvedValue({
        url: 'https://signed.example/download',
        expiresAt: '2026-08-03T09:05:00.000Z',
      });

      const actualView = await documentService.getDownloadUrl(
        '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
        ACTOR,
      );

      expect(mockObjectStorageService.getSignedUrl).toHaveBeenCalledWith({
        key: CLINIC_KEY,
        responseContentDisposition: `attachment; filename="SOP Pendaftaran.pdf"; filename*=UTF-8''SOP%20Pendaftaran.pdf`,
        responseContentType: 'application/pdf',
      });
      expect(actualView).toEqual({
        url: 'https://signed.example/download',
        expiresAt: '2026-08-03T09:05:00.000Z',
      });
    });
  });

  describe('updateDocument', () => {
    it('discards the chunks and returns the document to PENDING when visibility changes', async () => {
      mockDocumentRepository.findDocumentById.mockResolvedValue(
        buildDocumentRecord({ visibility: 'BOTH', ingestStatus: 'READY', chunkCount: 12 }),
      );
      mockDocumentRepository.updateDocument.mockResolvedValue(
        buildDocumentRecord({ visibility: 'DOCTOR' }),
      );

      await documentService.updateDocument(
        '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
        { visibility: 'DOCTOR' },
        ACTOR,
      );

      // Chunks carry a copy of visibility. Leaving them behind would keep a
      // staff-only SOP answering patient questions until someone re-ingested.
      expect(mockDocumentRepository.updateDocument).toHaveBeenCalledWith(
        '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
        expect.objectContaining({ visibility: 'DOCTOR', ingestStatus: 'PENDING' }),
        true,
      );
    });

    it('keeps the chunks when only the title changes', async () => {
      mockDocumentRepository.findDocumentById.mockResolvedValue(
        buildDocumentRecord({ ingestStatus: 'READY', chunkCount: 12 }),
      );
      mockDocumentRepository.updateDocument.mockResolvedValue(
        buildDocumentRecord({ title: 'Renamed', ingestStatus: 'READY', chunkCount: 12 }),
      );

      await documentService.updateDocument(
        '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
        { title: 'Renamed' },
        ACTOR,
      );

      expect(mockDocumentRepository.updateDocument).toHaveBeenCalledWith(
        '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
        expect.objectContaining({ ingestStatus: undefined }),
        false,
      );
    });

    it('keeps the chunks when visibility is resubmitted unchanged', async () => {
      mockDocumentRepository.findDocumentById.mockResolvedValue(
        buildDocumentRecord({ visibility: 'BOTH', ingestStatus: 'READY', chunkCount: 12 }),
      );
      mockDocumentRepository.updateDocument.mockResolvedValue(
        buildDocumentRecord({ ingestStatus: 'READY', chunkCount: 12 }),
      );

      await documentService.updateDocument(
        '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
        { visibility: 'BOTH' },
        ACTOR,
      );

      // A no-op edit must not cost a re-embed of the whole document.
      expect(mockDocumentRepository.updateDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        false,
      );
    });

    it('rejects an edit to a document that is not in the clinic corpus', async () => {
      mockDocumentRepository.findDocumentById.mockResolvedValue(null);

      await expect(
        documentService.updateDocument(
          '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
          { title: 'Renamed' },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteDocument', () => {
    it('reports how many chunks stopped being retrievable', async () => {
      const deletedAt = new Date('2026-08-03T10:00:00.000Z');
      mockDocumentRepository.findDocumentById.mockResolvedValue(
        buildDocumentRecord({ chunkCount: 12 }),
      );
      mockDocumentRepository.softDeleteDocument.mockResolvedValue({
        document: buildDocumentRecord(),
        deletedAt,
        chunksRemoved: 12,
      });

      const actualView = await documentService.deleteDocument(
        '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
        ACTOR,
      );

      expect(actualView).toEqual({
        id: '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
        deletedAt: deletedAt.toISOString(),
        chunksRemoved: 12,
      });
    });
  });

  describe('clinic-corpus scope', () => {
    // The global guard only proves the actor may act on *some* Document: a
    // CASL rule carrying an ownership condition still answers "can write
    // Document" affirmatively for the subject type. DOCTOR holds both OWN
    // grants for a personal knowledge base, so without the service check
    // every clinician would reach the shared corpus through these routes.
    beforeEach(() => {
      mockAuthRepository.findUserById.mockResolvedValue(
        buildActorWithPermissions(OWN_SCOPE_PERMISSIONS) as never,
      );
    });

    it('refuses an owner-scoped actor on every clinic-corpus operation', async () => {
      const attempts = [
        () =>
          documentService.createUploadUrl({ mimeType: 'application/pdf', sizeBytes: 10 }, ACTOR),
        () =>
          documentService.confirmUpload(
            {
              storageKey: CLINIC_KEY,
              title: 'SOP',
              purpose: 'FAQ_KNOWLEDGE_BASE',
              visibility: 'BOTH',
              language: 'ID',
            },
            ACTOR,
          ),
        () => documentService.listDocuments({ limit: 20 }, ACTOR),
        () => documentService.getDocument('2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11', ACTOR),
        () => documentService.getDownloadUrl('2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11', ACTOR),
        () =>
          documentService.updateDocument(
            '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
            { title: 'Renamed' },
            ACTOR,
          ),
        () => documentService.deleteDocument('2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11', ACTOR),
      ];

      for (const attempt of attempts) {
        await expect(attempt()).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(mockDocumentRepository.listDocuments).not.toHaveBeenCalled();
      expect(mockDocumentRepository.createDocument).not.toHaveBeenCalled();
    });
  });

  describe('reingestDocument', () => {
    it('refuses to re-ingest an image, which has no text to extract', async () => {
      // The row is `NOT_APPLICABLE` by design, not by failure, so the retry
      // an admin would reach for has to say why rather than queue a job that
      // can only fail.
      mockDocumentRepository.findDocumentById.mockResolvedValue(
        buildDocumentRecord({ mimeType: 'image/jpeg', ingestStatus: 'NOT_APPLICABLE' }),
      );

      await expect(
        documentService.reingestDocument('2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11', ACTOR),
      ).rejects.toThrow('never ingested');
      expect(mockDocumentRepository.markDocumentPending).not.toHaveBeenCalled();
    });
  });
});

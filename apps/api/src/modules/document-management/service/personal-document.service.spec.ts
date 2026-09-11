import { DocumentRecord } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { DocumentRepository } from '../repository/document.repository';
import { PersonalDocumentService } from './personal-document.service';
import { UploadedDocumentGuardService } from './uploaded-document-guard.service';

const DOCTOR_ID = 'd1b2c3a4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const DOCUMENT_ID = '4c1e8b90-72da-4f3a-8f21-6b90ad5e4412';
const STORAGE_KEY = `documents/doctor/${DOCUMENT_ID}.md`;
const ACTOR: CurrentUser = { sub: DOCTOR_ID } as CurrentUser;

function buildActorRecord() {
  return {
    id: DOCTOR_ID,
    roles: [
      {
        role: {
          code: 'DOCTOR',
          permissions: [{ permission: { resource: 'Document', action: 'read', scope: 'OWN' } }],
        },
      },
    ],
  };
}

function buildDocumentRecord(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: DOCUMENT_ID,
    ownerType: 'DOCTOR',
    ownerId: DOCTOR_ID,
    purpose: 'PERSONAL_KNOWLEDGE_BASE',
    title: 'Catatan dosis anak',
    storageKey: STORAGE_KEY,
    mimeType: 'text/markdown',
    sizeBytes: 512,
    ...overrides,
  } as DocumentRecord;
}

describe('PersonalDocumentService', () => {
  const documentRepositoryMock = { findDocumentById: jest.fn() };
  const objectStorageServiceMock = { getObject: jest.fn() };
  const authRepositoryMock = { findUserById: jest.fn() };

  const service = new PersonalDocumentService(
    documentRepositoryMock as unknown as DocumentRepository,
    objectStorageServiceMock as unknown as ObjectStorageService,
    authRepositoryMock as unknown as AuthRepository,
    {} as UploadedDocumentGuardService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    authRepositoryMock.findUserById.mockResolvedValue(buildActorRecord());
  });

  describe('getPreview', () => {
    it('returns my own Markdown document’s text, stripped of markup', async () => {
      documentRepositoryMock.findDocumentById.mockResolvedValue(buildDocumentRecord());
      objectStorageServiceMock.getObject.mockResolvedValue({
        key: STORAGE_KEY,
        body: Buffer.from('# Dosis\n\n<i>catatan</i> amoksisilin'),
      });

      const actual = await service.getPreview(DOCUMENT_ID, ACTOR);

      expect(documentRepositoryMock.findDocumentById).toHaveBeenCalledWith(
        DOCUMENT_ID,
        'DOCTOR',
        DOCTOR_ID,
      );
      expect(objectStorageServiceMock.getObject).toHaveBeenCalledWith({ key: STORAGE_KEY });
      expect(actual).toMatchObject({
        documentId: DOCUMENT_ID,
        mimeType: 'text/markdown',
        text: '# Dosis\n\ncatatan amoksisilin',
        isTruncated: false,
      });
    });

    it('is 404 for a document outside my knowledge base, before any file is read', async () => {
      documentRepositoryMock.findDocumentById.mockResolvedValue(null);

      await expect(service.getPreview(DOCUMENT_ID, ACTOR)).rejects.toThrow('Document not found');
      expect(objectStorageServiceMock.getObject).not.toHaveBeenCalled();
    });

    it('refuses a PDF without reading the file, which keeps its download', async () => {
      documentRepositoryMock.findDocumentById.mockResolvedValue(
        buildDocumentRecord({ mimeType: 'application/pdf' }),
      );

      await expect(service.getPreview(DOCUMENT_ID, ACTOR)).rejects.toMatchObject({
        response: { code: 'PERSONAL_DOCUMENT_NOT_PREVIEWABLE' },
      });
      expect(objectStorageServiceMock.getObject).not.toHaveBeenCalled();
    });

    it('refuses a caller who has no personal knowledge base', async () => {
      authRepositoryMock.findUserById.mockResolvedValue({ id: DOCTOR_ID, roles: [] });

      await expect(service.getPreview(DOCUMENT_ID, ACTOR)).rejects.toThrow('not allowed');
      expect(documentRepositoryMock.findDocumentById).not.toHaveBeenCalled();
    });
  });
});

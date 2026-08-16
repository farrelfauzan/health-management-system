import { BadRequestException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { UploadedDocumentGuardService } from './uploaded-document-guard.service';

const STORAGE_KEY = 'documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf';
const ACTOR_USER_ID = 'a3c9b2e1-4d5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('UploadedDocumentGuardService', () => {
  let mockObjectStorageService: jest.Mocked<ObjectStorageService>;
  let mockAuditService: jest.Mocked<AuditService>;
  let guardService: UploadedDocumentGuardService;

  beforeEach(() => {
    mockObjectStorageService = {
      getObject: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue({ key: STORAGE_KEY, deleted: true }),
    } as unknown as jest.Mocked<ObjectStorageService>;
    mockAuditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    guardService = new UploadedDocumentGuardService(mockObjectStorageService, mockAuditService);
  });

  it('passes silently when the bytes agree with the declared type', async () => {
    mockObjectStorageService.getObject.mockResolvedValue({
      key: STORAGE_KEY,
      body: Buffer.from('%PDF-1.4\ntrailer << /Root 1 0 R >>\n%%EOF', 'ascii'),
      contentType: 'application/pdf',
    });

    await expect(
      guardService.assertUploadedContentMatches({
        storageKey: STORAGE_KEY,
        declaredMimeType: 'application/pdf',
        actorUserId: ACTOR_USER_ID,
      }),
    ).resolves.toBeUndefined();

    expect(mockObjectStorageService.deleteObject).not.toHaveBeenCalled();
    expect(mockAuditService.record).not.toHaveBeenCalled();
  });

  it('deletes the object, audits, and rejects when the bytes disagree', async () => {
    mockObjectStorageService.getObject.mockResolvedValue({
      key: STORAGE_KEY,
      body: Buffer.concat([Buffer.from('MZ', 'ascii'), Buffer.alloc(62, 0)]),
      contentType: 'application/pdf',
    });

    await expect(
      guardService.assertUploadedContentMatches({
        storageKey: STORAGE_KEY,
        declaredMimeType: 'application/pdf',
        actorUserId: ACTOR_USER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockObjectStorageService.deleteObject).toHaveBeenCalledWith({ key: STORAGE_KEY });
    expect(mockAuditService.record).toHaveBeenCalledWith({
      action: 'DOCUMENT_UPLOAD_REJECTED',
      resource: 'document',
      actorUserId: ACTOR_USER_ID,
      metadata: {
        storageKey: STORAGE_KEY,
        declaredMimeType: 'application/pdf',
        reason: expect.stringContaining('PDF signature'),
      },
    });
  });

  it('deletes before answering, so a retried confirm cannot eventually be believed', async () => {
    const callOrder: string[] = [];
    mockObjectStorageService.getObject.mockResolvedValue({
      key: STORAGE_KEY,
      body: Buffer.from([0x00, 0x01, 0x02]),
      contentType: 'text/plain',
    });
    mockObjectStorageService.deleteObject.mockImplementation(async () => {
      callOrder.push('delete');
      return { key: STORAGE_KEY, deleted: true };
    });
    mockAuditService.record.mockImplementation(async () => {
      callOrder.push('audit');
    });

    await expect(
      guardService.assertUploadedContentMatches({
        storageKey: STORAGE_KEY,
        declaredMimeType: 'text/plain',
        actorUserId: ACTOR_USER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(callOrder).toEqual(['delete', 'audit']);
  });
});

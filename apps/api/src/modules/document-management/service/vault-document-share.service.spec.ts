import { DocumentRecord, VaultDocumentShareRecord } from '@hms/shared-types';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { NotificationService } from '../../notification/service/notification.service';
import { VaultDocumentShareRepository } from '../repository/vault-document-share.repository';
import { VaultDocumentRepository } from '../repository/vault-document.repository';
import { VaultDocumentAccessService } from './vault-document-access.service';
import { VaultDocumentShareService } from './vault-document-share.service';

const OWNER: CurrentUser = { sub: 'owner-1', email: 'dokter@example.test' } as CurrentUser;
const RECIPIENT: CurrentUser = { sub: 'grantee-1', email: 'admin@example.test' } as CurrentUser;

function buildDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'document-1',
    title: 'STR Dokter Umum',
    storageKey: 'documents/vault/doctor/document-1.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    ...overrides,
  } as DocumentRecord;
}

function buildShare(overrides: Partial<VaultDocumentShareRecord> = {}): VaultDocumentShareRecord {
  return {
    id: 'share-1',
    documentId: 'document-1',
    granteeId: 'grantee-1',
    granteeEmail: 'admin@example.test',
    isGranteeActive: true,
    grantedById: 'owner-1',
    grantedByEmail: 'dokter@example.test',
    expiresAt: null,
    revokedAt: null,
    lastAccessedAt: null,
    accessCount: 0,
    createdAt: new Date('2026-09-03T09:10:00.000Z'),
    ...overrides,
  };
}

describe('VaultDocumentShareService', () => {
  const shareRepositoryMock = {
    upsertShare: jest.fn(),
    listSharesForOwnedDocument: jest.fn(),
    findShareForOwnedDocument: jest.fn(),
    revokeShare: jest.fn(),
    listSharedWithMe: jest.fn(),
    findSharedWithMeDocument: jest.fn(),
    recordSharedAccess: jest.fn(),
    listShareRecipients: jest.fn(),
    isEligibleRecipient: jest.fn(),
  };
  const vaultDocumentRepositoryMock = { findVaultDocumentById: jest.fn() };
  const accessServiceMock = { resolveVaultOwnerType: jest.fn() };
  const objectStorageServiceMock = { getSignedUrl: jest.fn() };
  const notificationServiceMock = { createForUser: jest.fn() };
  const auditServiceMock = { recordOrThrow: jest.fn() };
  let service: VaultDocumentShareService;

  beforeEach(() => {
    jest.clearAllMocks();
    accessServiceMock.resolveVaultOwnerType.mockResolvedValue('DOCTOR');
    vaultDocumentRepositoryMock.findVaultDocumentById.mockResolvedValue(buildDocument());
    shareRepositoryMock.isEligibleRecipient.mockResolvedValue(true);
    shareRepositoryMock.upsertShare.mockResolvedValue(buildShare());
    auditServiceMock.recordOrThrow.mockResolvedValue(undefined);
    notificationServiceMock.createForUser.mockResolvedValue(undefined);
    objectStorageServiceMock.getSignedUrl.mockResolvedValue({
      url: 'https://example.test/signed',
      expiresAt: '2026-09-03T09:15:00.000Z',
    });
    service = new VaultDocumentShareService(
      shareRepositoryMock as unknown as VaultDocumentShareRepository,
      vaultDocumentRepositoryMock as unknown as VaultDocumentRepository,
      accessServiceMock as unknown as VaultDocumentAccessService,
      objectStorageServiceMock as unknown as ObjectStorageService,
      notificationServiceMock as unknown as NotificationService,
      auditServiceMock as unknown as AuditService,
    );
  });

  describe('createShare', () => {
    it('grants access, notifies the recipient, and audits the grant', async () => {
      const actualView = await service.createShare(
        'document-1',
        { granteeId: 'grantee-1' },
        OWNER,
      );

      expect(actualView.granteeEmail).toBe('admin@example.test');
      expect(actualView.isLive).toBe(true);
      expect(notificationServiceMock.createForUser).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'grantee-1', type: 'VAULT_DOCUMENT_SHARED' }),
      );
      expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'VAULT_DOCUMENT_SHARE_GRANTED' }),
      );
    });

    it('refuses a document the actor does not own, without writing a share', async () => {
      vaultDocumentRepositoryMock.findVaultDocumentById.mockResolvedValue(null);

      await expect(
        service.createShare('document-1', { granteeId: 'grantee-1' }, OWNER),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(shareRepositoryMock.upsertShare).not.toHaveBeenCalled();
    });

    it('refuses a recipient who could never open a vault document', async () => {
      shareRepositoryMock.isEligibleRecipient.mockResolvedValue(false);

      await expect(
        service.createShare('document-1', { granteeId: 'patient-1' }, OWNER),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(shareRepositoryMock.upsertShare).not.toHaveBeenCalled();
    });

    it('refuses a share to yourself', async () => {
      await expect(
        service.createShare('document-1', { granteeId: OWNER.sub }, OWNER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an expiry that has already passed', async () => {
      await expect(
        service.createShare(
          'document-1',
          { granteeId: 'grantee-1', expiresAt: '2020-01-01T00:00:00.000Z' },
          OWNER,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('still returns the share when the recipient notification fails', async () => {
      notificationServiceMock.createForUser.mockRejectedValue(new Error('bell down'));

      const actualView = await service.createShare(
        'document-1',
        { granteeId: 'grantee-1' },
        OWNER,
      );

      expect(actualView.id).toBe('share-1');
    });
  });

  describe('revokeShare', () => {
    it('revokes and audits, naming the owner, the recipient and the share', async () => {
      shareRepositoryMock.findShareForOwnedDocument.mockResolvedValue(buildShare());
      shareRepositoryMock.revokeShare.mockResolvedValue(new Date('2026-09-04T08:00:00.000Z'));

      const actualView = await service.revokeShare('document-1', 'share-1', OWNER);

      expect(actualView.revokedAt).toBe('2026-09-04T08:00:00.000Z');
      expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VAULT_DOCUMENT_SHARE_REVOKED',
          metadata: expect.objectContaining({
            shareId: 'share-1',
            ownerId: 'owner-1',
            granteeId: 'grantee-1',
          }),
        }),
      );
    });

    it('reports a share of somebody else’s document as not found', async () => {
      shareRepositoryMock.findShareForOwnedDocument.mockResolvedValue(null);

      await expect(
        service.revokeShare('document-1', 'share-1', OWNER),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(shareRepositoryMock.revokeShare).not.toHaveBeenCalled();
    });
  });

  describe('listSharesForDocument', () => {
    it('marks a revoked share not live, and one past its expiry not live either', async () => {
      shareRepositoryMock.listSharesForOwnedDocument.mockResolvedValue([
        buildShare({ id: 'live' }),
        buildShare({ id: 'revoked', revokedAt: new Date('2026-09-04T08:00:00.000Z') }),
        buildShare({ id: 'expired', expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
        buildShare({ id: 'deactivated', isGranteeActive: false }),
      ]);

      const actualView = await service.listSharesForDocument('document-1', OWNER);

      expect(actualView.items.map((share) => [share.id, share.isLive])).toEqual([
        ['live', true],
        ['revoked', false],
        ['expired', false],
        ['deactivated', false],
      ]);
    });
  });

  describe('getSharedDownloadUrl', () => {
    it('records the access and notifies the owner on the first open', async () => {
      shareRepositoryMock.findSharedWithMeDocument.mockResolvedValue({
        share: buildShare(),
        storageKey: 'documents/vault/doctor/document-1.pdf',
        title: 'STR Dokter Umum',
      });
      shareRepositoryMock.recordSharedAccess.mockResolvedValue({ isFirstAccess: true });

      const actualView = await service.getSharedDownloadUrl('document-1', RECIPIENT);

      expect(actualView.url).toBe('https://example.test/signed');
      expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'VAULT_DOCUMENT_SHARED_ACCESS' }),
      );
      expect(notificationServiceMock.createForUser).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'owner-1', type: 'VAULT_DOCUMENT_OPENED' }),
      );
    });

    it('does not notify the owner again on a second open', async () => {
      shareRepositoryMock.findSharedWithMeDocument.mockResolvedValue({
        share: buildShare({ accessCount: 1 }),
        storageKey: 'documents/vault/doctor/document-1.pdf',
        title: 'STR Dokter Umum',
      });
      shareRepositoryMock.recordSharedAccess.mockResolvedValue({ isFirstAccess: false });

      await service.getSharedDownloadUrl('document-1', RECIPIENT);

      expect(notificationServiceMock.createForUser).not.toHaveBeenCalled();
    });

    it('reports a revoked or expired share as not found, issuing no URL', async () => {
      shareRepositoryMock.findSharedWithMeDocument.mockResolvedValue(null);

      await expect(
        service.getSharedDownloadUrl('document-1', RECIPIENT),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(objectStorageServiceMock.getSignedUrl).not.toHaveBeenCalled();
      expect(shareRepositoryMock.recordSharedAccess).not.toHaveBeenCalled();
    });

    it('issues no URL when the access cannot be recorded', async () => {
      shareRepositoryMock.findSharedWithMeDocument.mockResolvedValue({
        share: buildShare(),
        storageKey: 'documents/vault/doctor/document-1.pdf',
        title: 'STR Dokter Umum',
      });
      auditServiceMock.recordOrThrow.mockRejectedValue(new Error('audit down'));

      await expect(
        service.getSharedDownloadUrl('document-1', RECIPIENT),
      ).rejects.toThrow('audit down');
      expect(shareRepositoryMock.recordSharedAccess).not.toHaveBeenCalled();
    });
  });

  describe('listSharedWithMe', () => {
    it('exposes only what a recipient needs, and none of the owner’s filing notes', async () => {
      shareRepositoryMock.listSharedWithMe.mockResolvedValue({
        items: [
          {
            shareId: 'share-1',
            documentId: 'document-1',
            title: 'STR Dokter Umum',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            storageKey: 'documents/vault/doctor/document-1.pdf',
            sharedByEmail: 'dokter@example.test',
            sharedAt: new Date('2026-09-03T09:10:00.000Z'),
            expiresAt: null,
          },
        ],
        nextCursor: null,
      });

      const actualView = await service.listSharedWithMe({ limit: 20 }, RECIPIENT);

      expect(Object.keys(actualView.items[0] ?? {})).toEqual([
        'id',
        'title',
        'mimeType',
        'sizeBytes',
        'sharedByEmail',
        'sharedAt',
        'expiresAt',
      ]);
      // The owner's own notes about their paperwork, and the storage key, are
      // absent by construction rather than by filtering.
      expect(actualView.items[0]).not.toHaveProperty('vaultCategory');
      expect(actualView.items[0]).not.toHaveProperty('referenceNumber');
      expect(actualView.items[0]).not.toHaveProperty('storageKey');
    });
  });
});

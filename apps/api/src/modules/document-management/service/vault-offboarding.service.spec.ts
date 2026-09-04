import { AuditService } from '../../../common/audit/audit.service';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { VaultDocumentRepository } from '../repository/vault-document.repository';
import { VaultOffboardingService } from './vault-offboarding.service';

describe('VaultOffboardingService', () => {
  const OWNER_ID = 'owner-1';
  const NOW = new Date('2026-10-04T01:00:00.000Z');
  const vaultDocumentRepositoryMock = {
    countVaultDocumentsByShareState: jest.fn(),
    listUnsharedVaultDocuments: jest.fn(),
    deleteVaultDocumentsByIds: jest.fn(),
  };
  const objectStorageServiceMock = { deleteObject: jest.fn() };
  const auditServiceMock = { recordOrThrow: jest.fn() };

  function buildService(): VaultOffboardingService {
    return new VaultOffboardingService(
      vaultDocumentRepositoryMock as unknown as VaultDocumentRepository,
      objectStorageServiceMock as unknown as ObjectStorageService,
      auditServiceMock as unknown as AuditService,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    vaultDocumentRepositoryMock.listUnsharedVaultDocuments.mockResolvedValue([
      { id: 'doc-1', storageKey: 'documents/vault/doctor/one.pdf' },
      { id: 'doc-2', storageKey: 'documents/vault/doctor/two.pdf' },
    ]);
    vaultDocumentRepositoryMock.deleteVaultDocumentsByIds.mockResolvedValue(2);
    objectStorageServiceMock.deleteObject.mockResolvedValue(undefined);
    auditServiceMock.recordOrThrow.mockResolvedValue(undefined);
  });

  it('hard-deletes the unshared rows, then their objects, then audits the count', async () => {
    const actual = await buildService().purgeUnsharedDocuments(OWNER_ID, NOW);

    expect(actual).toBe(2);
    expect(vaultDocumentRepositoryMock.listUnsharedVaultDocuments).toHaveBeenCalledWith(
      OWNER_ID,
      NOW,
    );
    expect(vaultDocumentRepositoryMock.deleteVaultDocumentsByIds).toHaveBeenCalledWith(OWNER_ID, [
      'doc-1',
      'doc-2',
    ]);
    expect(objectStorageServiceMock.deleteObject.mock.calls.map(([input]) => input)).toEqual([
      { key: 'documents/vault/doctor/one.pdf' },
      { key: 'documents/vault/doctor/two.pdf' },
    ]);
    // FR-E3-28: one row with a count, no actor — the clinic's clock did this.
    expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith({
      action: 'USER_OFFBOARDING_VAULT_PURGED',
      resource: 'vault-document',
      actorUserId: null,
      resourceId: OWNER_ID,
      metadata: { deletedCount: 2 },
    });
    // Never the titles or keys: the documents are gone, and a list of them
    // in the audit log would outlive the privacy they had.
    expect(JSON.stringify(auditServiceMock.recordOrThrow.mock.calls)).not.toContain('one.pdf');
  });

  it('keeps going when one stored object cannot be removed', async () => {
    objectStorageServiceMock.deleteObject
      .mockRejectedValueOnce(new Error('bucket away'))
      .mockResolvedValueOnce(undefined);

    const actual = await buildService().purgeUnsharedDocuments(OWNER_ID, NOW);

    // An orphan in the bucket over a document the system promised is gone.
    expect(actual).toBe(2);
    expect(objectStorageServiceMock.deleteObject).toHaveBeenCalledTimes(2);
    expect(auditServiceMock.recordOrThrow).toHaveBeenCalledTimes(1);
  });

  it('audits a zero when there was nothing unshared to remove', async () => {
    vaultDocumentRepositoryMock.listUnsharedVaultDocuments.mockResolvedValue([]);
    vaultDocumentRepositoryMock.deleteVaultDocumentsByIds.mockResolvedValue(0);

    const actual = await buildService().purgeUnsharedDocuments(OWNER_ID, NOW);

    expect(actual).toBe(0);
    expect(objectStorageServiceMock.deleteObject).not.toHaveBeenCalled();
    expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { deletedCount: 0 } }),
    );
  });

  it('passes the preview through from the repository', async () => {
    vaultDocumentRepositoryMock.countVaultDocumentsByShareState.mockResolvedValue({
      sharedDocumentCount: 1,
      unsharedDocumentCount: 4,
    });

    await expect(buildService().summariseVault(OWNER_ID, NOW)).resolves.toEqual({
      sharedDocumentCount: 1,
      unsharedDocumentCount: 4,
    });
  });
});

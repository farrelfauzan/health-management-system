import { ConfigService } from '@nestjs/config';

import { Document } from '../../../generated/prisma/client';
import { NotificationService } from '../../notification/service/notification.service';
import { VaultDocumentRepository } from '../repository/vault-document.repository';
import { VaultDocumentExpiryWorker } from './vault-document-expiry.worker';

const CLINIC_TODAY = '2026-09-03T02:00:00.000Z';

function buildDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'document-1',
    ownerId: 'owner-1',
    title: 'STR Dokter Umum',
    expiresAt: new Date('2026-10-03T00:00:00.000Z'),
    ...overrides,
  } as Document;
}

describe('VaultDocumentExpiryWorker', () => {
  const vaultDocumentRepositoryMock = {
    listExpiringVaultDocuments: jest.fn(),
    claimExpiryNotice: jest.fn(),
  };
  const notificationServiceMock = {
    createForUser: jest.fn(),
    createForUsers: jest.fn(),
    createForUsersWithPermission: jest.fn(),
  };
  const configServiceMock = { get: jest.fn() };
  let worker: VaultDocumentExpiryWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date(CLINIC_TODAY));
    configServiceMock.get.mockImplementation((key: string) =>
      key === 'CLINIC_TIMEZONE' ? 'Asia/Jakarta' : undefined,
    );
    vaultDocumentRepositoryMock.listExpiringVaultDocuments.mockResolvedValue([]);
    notificationServiceMock.createForUser.mockResolvedValue(undefined);
    worker = new VaultDocumentExpiryWorker(
      vaultDocumentRepositoryMock as unknown as VaultDocumentRepository,
      notificationServiceMock as unknown as NotificationService,
      configServiceMock as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends exactly one notification, to the owner, for a document 30 days from expiry', async () => {
    // Present at the 60-day sweep too, since 30 days out is inside 60 — the
    // notice claim is what makes it one reminder rather than two.
    vaultDocumentRepositoryMock.listExpiringVaultDocuments.mockResolvedValue([buildDocument()]);
    vaultDocumentRepositoryMock.claimExpiryNotice.mockImplementation(
      async (_documentId: string, thresholdDays: number) => thresholdDays === 60,
    );

    const actualSent = await worker.sweepOnce();

    expect(actualSent).toBe(1);
    expect(notificationServiceMock.createForUser).toHaveBeenCalledTimes(1);
    expect(notificationServiceMock.createForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner-1', type: 'VAULT_DOCUMENT_EXPIRING' }),
    );
  });

  it('creates zero admin notifications — there is no broadcast path in this job at all', async () => {
    vaultDocumentRepositoryMock.listExpiringVaultDocuments.mockResolvedValue([buildDocument()]);
    vaultDocumentRepositoryMock.claimExpiryNotice.mockResolvedValue(true);

    await worker.sweepOnce();

    // US-E3-04. The broadcast producers are the only way a notification
    // reaches somebody other than a named user, and this job never calls one.
    expect(notificationServiceMock.createForUsers).not.toHaveBeenCalled();
    expect(notificationServiceMock.createForUsersWithPermission).not.toHaveBeenCalled();
    for (const [payload] of notificationServiceMock.createForUser.mock.calls) {
      expect(payload.userId).toBe('owner-1');
    }
  });

  it('sends nothing on a second run the same day, because every notice is already claimed', async () => {
    vaultDocumentRepositoryMock.listExpiringVaultDocuments.mockResolvedValue([buildDocument()]);
    vaultDocumentRepositoryMock.claimExpiryNotice.mockResolvedValue(false);

    const actualSent = await worker.sweepOnce();

    expect(actualSent).toBe(0);
    expect(notificationServiceMock.createForUser).not.toHaveBeenCalled();
  });

  it('still fires the 0-day threshold for an expiry that passed while the job was down', async () => {
    vaultDocumentRepositoryMock.listExpiringVaultDocuments.mockResolvedValue([
      buildDocument({ expiresAt: new Date('2026-08-01T00:00:00.000Z') }),
    ]);
    vaultDocumentRepositoryMock.claimExpiryNotice.mockImplementation(
      async (_documentId: string, thresholdDays: number) => thresholdDays === 0,
    );

    await worker.sweepOnce();

    expect(notificationServiceMock.createForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner-1', type: 'VAULT_DOCUMENT_EXPIRED' }),
    );
  });

  it('links the reminder to the owner’s own vault, never to another surface', async () => {
    vaultDocumentRepositoryMock.listExpiringVaultDocuments.mockResolvedValue([buildDocument()]);
    vaultDocumentRepositoryMock.claimExpiryNotice.mockResolvedValue(true);

    await worker.sweepOnce();

    const [payload] = notificationServiceMock.createForUser.mock.calls[0] ?? [];
    expect(payload.href).toBe('/vault');
  });

  it('skips a document with no owner rather than sending a reminder to nobody', async () => {
    vaultDocumentRepositoryMock.listExpiringVaultDocuments.mockResolvedValue([
      buildDocument({ ownerId: null }),
    ]);
    vaultDocumentRepositoryMock.claimExpiryNotice.mockResolvedValue(true);

    await worker.sweepOnce();

    expect(notificationServiceMock.createForUser).not.toHaveBeenCalled();
  });

  it('skips a sweep that is already running rather than queueing a second pass', async () => {
    let releaseFirstSweep: (() => void) | undefined;
    vaultDocumentRepositoryMock.listExpiringVaultDocuments
      .mockResolvedValue([])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstSweep = () => resolve([]);
          }),
      );

    const firstSweep = worker.sweepOnce();
    const actualSecondResult = await worker.sweepOnce();
    releaseFirstSweep?.();
    await firstSweep;

    expect(actualSecondResult).toBe(0);
  });
});

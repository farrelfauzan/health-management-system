import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { VaultDocumentShareRepository } from './vault-document-share.repository';
import { VaultDocumentRepository } from './vault-document.repository';

/**
 * `P16-T34` through the repository against real PostgreSQL.
 *
 * The guarantees worth proving here only exist in the database. The
 * live-share predicate is the security boundary of the whole feature — not
 * revoked, not expired, recipient still active — and it lives in four
 * separate `where` clauses across two query methods. A mocked spec would
 * prove that the methods were called; only a real database proves that a
 * revoked row stops matching.
 *
 * The `NOT VALID` note in the migration explains why the "only a
 * `DOCTOR_VAULT` document can be shared" rule is not a CHECK: PostgreSQL
 * forbids a subquery in one. This spec is where that rule is proven instead,
 * against a knowledge-base document forced into the share table's reach.
 *
 * Every fixture row is removed in `afterAll`; nothing existing is mutated.
 */
describe('Vault document shares against PostgreSQL', () => {
  const suffix = randomUUID();

  let prisma: PrismaService;
  let shareRepository: VaultDocumentShareRepository;
  let vaultDocumentRepository: VaultDocumentRepository;
  let ownerUserId: string;
  let granteeUserId: string;
  const documentIds: string[] = [];

  async function createVaultDocument(ownerId: string, title: string) {
    const record = await vaultDocumentRepository.createVaultDocument({
      ownerType: 'DOCTOR',
      ownerId,
      title,
      storageKey: `documents/vault/doctor/${randomUUID()}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      language: 'ID',
      vaultCategory: 'REGISTRATION_LICENCE',
      uploadedById: ownerId,
    });
    documentIds.push(record.id);
    return record;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    shareRepository = new VaultDocumentShareRepository(prisma);
    vaultDocumentRepository = new VaultDocumentRepository(prisma);
    const users = await prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      take: 2,
      select: { id: true },
    });
    const [owner, grantee] = users;
    if (owner === undefined || grantee === undefined) {
      throw new Error('The dev database needs two active users to prove sharing');
    }
    ownerUserId = owner.id;
    granteeUserId = grantee.id;
  });

  afterAll(async () => {
    await prisma.vaultDocumentShare.deleteMany({ where: { documentId: { in: documentIds } } });
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    await prisma.$disconnect();
  });

  it('resolves a live share for the named recipient, and for nobody else', async () => {
    const document = await createVaultDocument(ownerUserId, `Shared ${suffix}`);
    await shareRepository.upsertShare({
      documentId: document.id,
      granteeId: granteeUserId,
      grantedById: ownerUserId,
      expiresAt: null,
    });

    const forGrantee = await shareRepository.findSharedWithMeDocument({
      documentId: document.id,
      granteeId: granteeUserId,
      now: new Date(),
    });
    const forStranger = await shareRepository.findSharedWithMeDocument({
      documentId: document.id,
      granteeId: ownerUserId,
      now: new Date(),
    });

    expect(forGrantee?.share.granteeId).toBe(granteeUserId);
    // Being an administrator grants nothing here: the only thing that resolves
    // a non-owner read is a row naming that person (US-E3-05).
    expect(forStranger).toBeNull();
  });

  it('stops resolving the moment the share is revoked, with no window', async () => {
    const document = await createVaultDocument(ownerUserId, `Revoked ${suffix}`);
    const share = await shareRepository.upsertShare({
      documentId: document.id,
      granteeId: granteeUserId,
      grantedById: ownerUserId,
      expiresAt: null,
    });

    await shareRepository.revokeShare(share.id);
    const afterRevoke = await shareRepository.findSharedWithMeDocument({
      documentId: document.id,
      granteeId: granteeUserId,
      now: new Date(),
    });

    expect(afterRevoke).toBeNull();
  });

  it('stops resolving once the expiry passes, with no action from the owner', async () => {
    const document = await createVaultDocument(ownerUserId, `Expiring ${suffix}`);
    await shareRepository.upsertShare({
      documentId: document.id,
      granteeId: granteeUserId,
      grantedById: ownerUserId,
      expiresAt: new Date('2026-09-03T12:00:00.000Z'),
    });

    const beforeExpiry = await shareRepository.findSharedWithMeDocument({
      documentId: document.id,
      granteeId: granteeUserId,
      now: new Date('2026-09-03T11:59:00.000Z'),
    });
    const afterExpiry = await shareRepository.findSharedWithMeDocument({
      documentId: document.id,
      granteeId: granteeUserId,
      now: new Date('2026-09-03T12:01:00.000Z'),
    });

    expect(beforeExpiry).not.toBeNull();
    expect(afterExpiry).toBeNull();
  });

  it('revives the same row when re-shared after a revoke, rather than accumulating history', async () => {
    const document = await createVaultDocument(ownerUserId, `Reshared ${suffix}`);
    const first = await shareRepository.upsertShare({
      documentId: document.id,
      granteeId: granteeUserId,
      grantedById: ownerUserId,
      expiresAt: null,
    });
    await shareRepository.revokeShare(first.id);
    await shareRepository.recordSharedAccess(first.id, new Date());

    const second = await shareRepository.upsertShare({
      documentId: document.id,
      granteeId: granteeUserId,
      grantedById: ownerUserId,
      expiresAt: null,
    });
    const allShares = await shareRepository.listSharesForOwnedDocument(document.id, ownerUserId);

    expect(second.id).toBe(first.id);
    expect(second.revokedAt).toBeNull();
    // The open count resets with the key: counts carried over from a revoked
    // share would report opens against access that is no longer the access
    // being shown.
    expect(second.accessCount).toBe(0);
    expect(allShares).toHaveLength(1);
  });

  it('does not move the recorded revocation time when revoked twice', async () => {
    const document = await createVaultDocument(ownerUserId, `Double revoke ${suffix}`);
    const share = await shareRepository.upsertShare({
      documentId: document.id,
      granteeId: granteeUserId,
      grantedById: ownerUserId,
      expiresAt: null,
    });

    const firstRevoke = await shareRepository.revokeShare(share.id);
    const secondRevoke = await shareRepository.revokeShare(share.id);

    expect(firstRevoke).not.toBeNull();
    expect(secondRevoke?.getTime()).toBe(firstRevoke?.getTime());
  });

  it('counts opens and reports only the first as first', async () => {
    const document = await createVaultDocument(ownerUserId, `Opened ${suffix}`);
    const share = await shareRepository.upsertShare({
      documentId: document.id,
      granteeId: granteeUserId,
      grantedById: ownerUserId,
      expiresAt: null,
    });

    const firstOpen = await shareRepository.recordSharedAccess(share.id, new Date());
    const secondOpen = await shareRepository.recordSharedAccess(share.id, new Date());
    const [reloaded] = await shareRepository.listSharesForOwnedDocument(
      document.id,
      ownerUserId,
    );

    expect(firstOpen.isFirstAccess).toBe(true);
    expect(secondOpen.isFirstAccess).toBe(false);
    expect(reloaded?.accessCount).toBe(2);
    expect(reloaded?.lastAccessedAt).not.toBeNull();
  });

  it('refuses a share to yourself at the database, not merely in the service', async () => {
    const document = await createVaultDocument(ownerUserId, `Self share ${suffix}`);

    await expect(
      shareRepository.upsertShare({
        documentId: document.id,
        granteeId: ownerUserId,
        grantedById: ownerUserId,
        expiresAt: null,
      }),
    ).rejects.toThrow();
  });

  it('lists another owner’s shares as nothing, so the panel cannot be read sideways', async () => {
    const document = await createVaultDocument(ownerUserId, `Panel ${suffix}`);
    await shareRepository.upsertShare({
      documentId: document.id,
      granteeId: granteeUserId,
      grantedById: ownerUserId,
      expiresAt: null,
    });

    const asStranger = await shareRepository.listSharesForOwnedDocument(
      document.id,
      granteeUserId,
    );

    expect(asStranger).toEqual([]);
  });

  it('cascades every key away when the owner hard-deletes the document', async () => {
    const document = await createVaultDocument(ownerUserId, `Deleted ${suffix}`);
    await shareRepository.upsertShare({
      documentId: document.id,
      granteeId: granteeUserId,
      grantedById: ownerUserId,
      expiresAt: null,
    });

    await vaultDocumentRepository.deleteVaultDocument(document.id, ownerUserId);
    const remaining = await prisma.vaultDocumentShare.count({
      where: { documentId: document.id },
    });

    expect(remaining).toBe(0);
  });

  it('never returns a knowledge-base document through the share path', async () => {
    // The rule the migration could not express as a CHECK, proven here
    // instead. A share row is only reachable through queries that carry
    // `purpose: 'DOCTOR_VAULT'`, so even a row written straight into the
    // table against a knowledge-base document resolves to nothing.
    const knowledgeBaseDocument = await prisma.document.create({
      data: {
        ownerType: 'DOCTOR',
        ownerId: ownerUserId,
        purpose: 'PERSONAL_KNOWLEDGE_BASE',
        title: `KB ${suffix}`,
        storageKey: `documents/doctor/${randomUUID()}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        uploadedById: ownerUserId,
      },
    });
    documentIds.push(knowledgeBaseDocument.id);
    await shareRepository.upsertShare({
      documentId: knowledgeBaseDocument.id,
      granteeId: granteeUserId,
      grantedById: ownerUserId,
      expiresAt: null,
    });

    const asRecipient = await shareRepository.findSharedWithMeDocument({
      documentId: knowledgeBaseDocument.id,
      granteeId: granteeUserId,
      now: new Date(),
    });
    const listed = await shareRepository.listSharedWithMe({
      granteeId: granteeUserId,
      now: new Date(),
      limit: 100,
    });

    expect(asRecipient).toBeNull();
    expect(listed.items.map((item) => item.documentId)).not.toContain(knowledgeBaseDocument.id);
  });
});

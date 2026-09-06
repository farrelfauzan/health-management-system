import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { DocumentApprovalRepository } from './document-approval.repository';
import { DocumentTypeRepository } from './document-type.repository';
import { ManagedDocumentRepository } from './managed-document.repository';

/**
 * `P16-T29` through the repository against real PostgreSQL, because the two
 * guarantees worth proving here exist only in the database:
 *
 *   * the **partial unique index** allowing at most one `PENDING` round per
 *     document, which is what makes a double-submitted form impossible
 *     rather than merely unlikely; and
 *   * the **CHECK** requiring a reason on a rejection (FR-E5-17), so a
 *     client that skipped the schema and the service still cannot leave a
 *     drafter with "rejected" and no explanation.
 *
 * The row lock behind {@link DocumentApprovalRepository.claimDecision} is
 * proven here too, by running two decisions concurrently against the same
 * round: exactly one is recorded, and the document is issued exactly once
 * (§7.5.10). That is not observable against a mock.
 *
 * Every fixture row is removed in `afterAll`; nothing existing is mutated.
 */
describe('Document approval against PostgreSQL', () => {
  const suffix = randomUUID();
  const marker = `p16t29-${suffix}`;

  let prisma: PrismaService;
  let repository: DocumentApprovalRepository;
  let documentRepository: ManagedDocumentRepository;
  let typeRepository: DocumentTypeRepository;
  let drafterId: string;
  let approverId: string;
  let secondApproverId: string;
  let typeId: string;
  const documentIds: string[] = [];

  async function createUser(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: { email: `${marker}-${label}@example.test`, passwordHash: 'not-a-hash' },
      select: { id: true },
    });
    return user.id;
  }

  async function createDocument(title: string): Promise<string> {
    const record = await documentRepository.createDocument({
      typeId,
      status: 'DRAFT',
      title: `${marker} ${title}`,
      documentNumber: null,
      contentHtml: '<p>isi</p>',
      storageKey: null,
      storageMimeType: null,
      storageSizeBytes: null,
      patientId: null,
      doctorId: null,
      subjectTemplateId: null,
      subjectDocumentId: null,
      subjectInvoiceId: null,
      draftedById: drafterId,
      issuedAt: null,
    });
    documentIds.push(record.id);
    return record.id;
  }

  async function openRound(documentId: string, approverIds: string[], dueAt: Date | null) {
    return repository.createRequest({
      documentId,
      frozenPayload: {
        title: `${marker} frozen`,
        documentNumber: null,
        contentHtml: '<p>isi yang dibekukan</p>',
        storageKey: null,
        storageMimeType: null,
        storageSizeBytes: null,
        patientId: null,
        doctorId: null,
        approverIds,
        frozenAt: new Date().toISOString(),
      },
      submittedById: drafterId,
      dueAt,
      approverIds,
    });
  }

  function buildIssueContent(documentId: string) {
    return {
      documentId,
      title: `${marker} frozen`,
      documentNumber: null,
      contentHtml: '<p>isi yang dibekukan</p>',
      storageKey: null,
      storageMimeType: null,
      storageSizeBytes: null,
    };
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new DocumentApprovalRepository(prisma);
    documentRepository = new ManagedDocumentRepository(prisma);
    typeRepository = new DocumentTypeRepository(prisma);
    drafterId = await createUser('drafter');
    approverId = await createUser('approver');
    secondApproverId = await createUser('approver2');
    const type = await typeRepository.createType({
      code: `P16T29_${suffix.replaceAll('-', '').slice(0, 12).toUpperCase()}`,
      name: `${marker} type`,
      description: null,
      behavior: 'GENERIC',
      isApprovalRequired: true,
      allowSelfApproval: false,
      requiredApprovals: 1,
      requiresPatient: false,
      requiresDoctor: false,
      contentMode: 'EITHER',
      isActive: true,
      sortOrder: 999,
    });
    typeId = type.id;
  });

  afterAll(async () => {
    // Rounds, panels and decisions cascade from the document; the fixture
    // users are RESTRICTed by any decision they made, so decisions go first.
    await prisma.documentApprovalDecision.deleteMany({
      where: { request: { documentId: { in: documentIds } } },
    });
    await prisma.documentApprovalApprover.deleteMany({
      where: { request: { documentId: { in: documentIds } } },
    });
    await prisma.documentApprovalRequest.deleteMany({
      where: { documentId: { in: documentIds } },
    });
    await prisma.managedDocument.deleteMany({ where: { id: { in: documentIds } } });
    await prisma.documentType.deleteMany({ where: { id: typeId } });
    await prisma.user.deleteMany({
      where: { id: { in: [drafterId, approverId, secondApproverId] } },
    });
    await prisma.$disconnect();
  });

  it('allows at most one open round per document', async () => {
    const documentId = await createDocument('double-submit');
    await openRound(documentId, [approverId], null);

    await expect(openRound(documentId, [approverId], null)).rejects.toThrow();
  });

  it('lets a new round open once the previous one is resolved', async () => {
    const documentId = await createDocument('resubmit');
    const first = await openRound(documentId, [approverId], null);
    await repository.resolveWithoutDecision(first.id, 'WITHDRAWN');

    const second = await openRound(documentId, [approverId], null);

    // The partial index keys on PENDING only, so a withdrawn round does not
    // block the resubmission it exists to make possible (FR-E5-18).
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('PENDING');
  });

  it('refuses a rejection with no reason', async () => {
    const documentId = await createDocument('reason-check');
    const round = await openRound(documentId, [approverId], null);

    await expect(
      prisma.documentApprovalDecision.create({
        data: { requestId: round.id, approverId, isApproved: false, reason: null },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.documentApprovalDecision.create({
        data: { requestId: round.id, approverId, isApproved: false, reason: '   ' },
      }),
    ).rejects.toThrow();
  });

  it('accepts an approval with no reason', async () => {
    const documentId = await createDocument('approval-no-reason');
    const round = await openRound(documentId, [approverId], null);

    const decision = await prisma.documentApprovalDecision.create({
      data: { requestId: round.id, approverId, isApproved: true, reason: null },
      select: { id: true },
    });

    expect(decision.id).toBeDefined();
  });

  it('records one decision and one issue when two approvers decide at once', async () => {
    const documentId = await createDocument('race');
    const round = await openRound(documentId, [approverId, secondApproverId], null);

    const outcomes = await Promise.all([
      repository.claimDecision({
        requestId: round.id,
        approverId,
        isApproved: true,
        reason: null,
        requiredApprovals: 1,
        frozenContent: buildIssueContent(documentId),
      }),
      repository.claimDecision({
        requestId: round.id,
        approverId: secondApproverId,
        isApproved: true,
        reason: null,
        requiredApprovals: 1,
        frozenContent: buildIssueContent(documentId),
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome !== null)).toHaveLength(1);
    const decisionCount = await prisma.documentApprovalDecision.count({
      where: { requestId: round.id },
    });
    expect(decisionCount).toBe(1);
  });

  it('issues the frozen version, not the live row, when the round resolves', async () => {
    const documentId = await createDocument('frozen-issue');
    const round = await openRound(documentId, [approverId], null);
    // Somebody rewrote the row after submission. The approver approved the
    // snapshot, so the snapshot is what gets issued (FR-E5-16).
    await prisma.managedDocument.update({
      where: { id: documentId },
      data: { contentHtml: '<p>diubah setelah diajukan</p>' },
    });

    await repository.claimDecision({
      requestId: round.id,
      approverId,
      isApproved: true,
      reason: null,
      requiredApprovals: 1,
      frozenContent: buildIssueContent(documentId),
    });

    const actual = await prisma.managedDocument.findUniqueOrThrow({
      where: { id: documentId },
      select: { status: true, contentHtml: true, issuedAt: true },
    });
    expect(actual.status).toBe('ISSUED');
    expect(actual.contentHtml).toBe('<p>isi yang dibekukan</p>');
    expect(actual.issuedAt).not.toBeNull();
  });

  it('returns a rejected document to DRAFT in the same transaction as the decision', async () => {
    const documentId = await createDocument('rejection');
    await prisma.managedDocument.update({
      where: { id: documentId },
      data: { status: 'PENDING_APPROVAL' },
    });
    const round = await openRound(documentId, [approverId], null);

    await repository.claimDecision({
      requestId: round.id,
      approverId,
      isApproved: false,
      reason: 'Pasal 4 salah',
      requiredApprovals: 1,
      frozenContent: buildIssueContent(documentId),
    });

    const actual = await prisma.managedDocument.findUniqueOrThrow({
      where: { id: documentId },
      select: { status: true, issuedAt: true },
    });
    expect(actual.status).toBe('DRAFT');
    expect(actual.issuedAt).toBeNull();
  });

  it('claims each deadline notice exactly once', async () => {
    const documentId = await createDocument('deadline');
    const round = await openRound(documentId, [approverId], new Date('2026-01-01T00:00:00Z'));

    const first = await repository.claimDeadlineNotice(round.id, 'OVERDUE');
    const second = await repository.claimDeadlineNotice(round.id, 'OVERDUE');

    expect(first).toBe(true);
    expect(second).toBe(false);
    // The two kinds are claimed independently, so a due-soon reminder that
    // already fired does not swallow the overdue notice or the reverse.
    expect(await repository.claimDeadlineNotice(round.id, 'DUE_SOON')).toBe(true);
  });

  it('counts what is waiting on one approver, and how much of it is late', async () => {
    const lateId = await createDocument('late');
    await openRound(lateId, [secondApproverId], new Date('2026-01-01T00:00:00Z'));
    const onTimeId = await createDocument('on-time');
    await openRound(onTimeId, [secondApproverId], new Date('2099-01-01T00:00:00Z'));

    const actual = await repository.countPendingForApprover(
      secondApproverId,
      new Date('2026-06-01T00:00:00Z'),
    );

    expect(actual.pending).toBeGreaterThanOrEqual(2);
    expect(actual.overdue).toBeGreaterThanOrEqual(1);
    expect(actual.overdue).toBeLessThan(actual.pending);
  });
});

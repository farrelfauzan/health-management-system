import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';

import {
  DocumentApprovalRequestRecord,
  ManagedDocumentRecord,
  ManagedDocumentStatusValue,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuditAction } from '../../../generated/prisma/client';
import { DocumentApprovalRepository } from '../repository/document-approval.repository';
import { ManagedDocumentRepository } from '../repository/managed-document.repository';
import { DocumentApprovalNotificationService } from './document-approval-notification.service';
import { DocumentApprovalService } from './document-approval.service';
import { DocumentIssueBehaviorService } from './document-issue-behavior.service';
import { DocumentTypeService } from './document-type.service';
import { ManagedDocumentAccessService } from './managed-document-access.service';

const DRAFTER_ID = '11111111-1111-4111-8111-111111111111';
const APPROVER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444';
const ROUND_ID = '55555555-5555-4555-8555-555555555555';

const DRAFTER: CurrentUser = { sub: DRAFTER_ID } as CurrentUser;
const APPROVER: CurrentUser = { sub: APPROVER_ID } as CurrentUser;

function buildDocument(overrides: Partial<ManagedDocumentRecord> = {}): ManagedDocumentRecord {
  return {
    id: DOCUMENT_ID,
    typeId: '66666666-6666-4666-8666-666666666666',
    type: {
      id: '66666666-6666-4666-8666-666666666666',
      code: 'AGREEMENT_PATIENT_CLINIC',
      name: 'Perjanjian pasien–klinik',
      behavior: 'GENERIC',
      contentMode: 'EITHER',
      requiresPatient: false,
      requiresDoctor: false,
      isActive: true,
      isApprovalRequired: true,
      allowSelfApproval: false,
      requiredApprovals: 1,
    },
    status: 'DRAFT' as ManagedDocumentStatusValue,
    title: 'Perjanjian',
    documentNumber: null,
    contentHtml: '<p>isi</p>',
    storageKey: null,
    storageMimeType: null,
    storageSizeBytes: null,
    patient: null,
    doctor: null,
    subjectTemplateId: null,
    subjectDocumentId: null,
    subjectInvoiceId: null,
    subjectDocument: null,
    draftedBy: { id: DRAFTER_ID, email: 'drafter@klinik.example' },
    issuedAt: null,
    createdAt: new Date('2026-09-30T00:00:00Z'),
    updatedAt: new Date('2026-09-30T00:00:00Z'),
    ...overrides,
  };
}

function buildRound(
  overrides: Partial<DocumentApprovalRequestRecord> = {},
): DocumentApprovalRequestRecord {
  return {
    id: ROUND_ID,
    documentId: DOCUMENT_ID,
    status: 'PENDING',
    frozenPayload: {
      title: 'Perjanjian',
      documentNumber: null,
      contentHtml: '<p>isi yang disetujui</p>',
      storageKey: null,
      storageMimeType: null,
      storageSizeBytes: null,
      patientId: null,
      doctorId: null,
      approverIds: [APPROVER_ID],
      frozenAt: '2026-09-30T01:00:00.000Z',
    },
    submittedBy: { id: DRAFTER_ID, email: 'drafter@klinik.example' },
    submittedAt: new Date('2026-09-30T01:00:00Z'),
    dueAt: null,
    resolvedAt: null,
    dueSoonNotifiedAt: null,
    overdueNotifiedAt: null,
    approvers: [{ approverId: APPROVER_ID, email: 'approver@klinik.example', isEligible: true }],
    decisions: [],
    ...overrides,
  };
}

describe('DocumentApprovalService', () => {
  const approvalRepositoryMock = {
    createRequest: jest.fn(),
    findRequestById: jest.fn(),
    findPendingRequestForDocument: jest.fn(),
    listRequestsForDocument: jest.fn(),
    findPendingRequestsForDocuments: jest.fn(),
    findDocumentIdsAwaitingApprover: jest.fn(),
    listQueue: jest.fn(),
    countPendingForApprover: jest.fn(),
    claimDecision: jest.fn(),
    resolveWithoutDecision: jest.fn(),
    supersedePendingForDocument: jest.fn(),
    findApproverCandidates: jest.fn(),
  };
  const managedDocumentRepositoryMock = {
    findVisibleById: jest.fn(),
    transitionDocument: jest.fn(),
    // The direct-issue path runs the type's behaviour inside the transition's
    // own transaction (`P16-T32`), so the double has to invoke the callback —
    // a mock that swallowed it would let a broken behaviour pass.
    issueDocument: jest.fn(
      async (payload: {
        id: string;
        issuedAt: Date;
        onIssued: (tx: unknown) => Promise<void>;
      }) => {
        await payload.onIssued({});
      },
    ),
  };
  const accessServiceMock = { resolveContext: jest.fn() };
  const documentTypeServiceMock = { findTypeOrThrow: jest.fn() };
  const notificationServiceMock = { announceSubmitted: jest.fn(), announce: jest.fn() };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  const service = new DocumentApprovalService(
    approvalRepositoryMock as unknown as DocumentApprovalRepository,
    managedDocumentRepositoryMock as unknown as ManagedDocumentRepository,
    accessServiceMock as unknown as ManagedDocumentAccessService,
    documentTypeServiceMock as unknown as DocumentTypeService,
    new DocumentIssueBehaviorService(),
    notificationServiceMock as unknown as DocumentApprovalNotificationService,
    auditServiceMock as unknown as AuditService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    accessServiceMock.resolveContext.mockResolvedValue({ userId: DRAFTER_ID });
    managedDocumentRepositoryMock.findVisibleById.mockResolvedValue(buildDocument());
    documentTypeServiceMock.findTypeOrThrow.mockResolvedValue({ defaultApprovers: [] });
    approvalRepositoryMock.findPendingRequestForDocument.mockResolvedValue(null);
    approvalRepositoryMock.createRequest.mockResolvedValue(buildRound());
    approvalRepositoryMock.findApproverCandidates.mockResolvedValue([
      { id: APPROVER_ID, email: 'approver@klinik.example', isPatient: false, canDecide: true },
    ]);
  });

  describe('submitForApproval', () => {
    it('freezes the content and the panel, and moves the document to PENDING_APPROVAL', async () => {
      await service.submitForApproval(DOCUMENT_ID, { approverIds: [APPROVER_ID] }, DRAFTER);

      const actualPayload = approvalRepositoryMock.createRequest.mock.calls[0][0];
      expect(actualPayload.frozenPayload.contentHtml).toBe('<p>isi</p>');
      expect(actualPayload.frozenPayload.approverIds).toEqual([APPROVER_ID]);
      expect(managedDocumentRepositoryMock.transitionDocument).toHaveBeenCalledWith({
        id: DOCUMENT_ID,
        status: 'PENDING_APPROVAL',
      });
    });

    it('records the panel separately from the submission (NFR-AUD-03)', async () => {
      await service.submitForApproval(DOCUMENT_ID, { approverIds: [APPROVER_ID] }, DRAFTER);

      const actualActions = auditServiceMock.record.mock.calls.map((call) => call[0].action);
      expect(actualActions).toContain(AuditAction.APPROVAL_SUBMITTED);
      expect(actualActions).toContain(AuditAction.APPROVERS_ASSIGNED);
    });

    it('refuses a panel that names only the drafter when self-approval is off', async () => {
      approvalRepositoryMock.findApproverCandidates.mockResolvedValue([
        { id: DRAFTER_ID, email: 'drafter@klinik.example', isPatient: false, canDecide: true },
      ]);

      await expect(
        service.submitForApproval(DOCUMENT_ID, { approverIds: [DRAFTER_ID] }, DRAFTER),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(approvalRepositoryMock.createRequest).not.toHaveBeenCalled();
    });

    it('refuses a panel naming a patient account', async () => {
      approvalRepositoryMock.findApproverCandidates.mockResolvedValue([
        { id: APPROVER_ID, email: 'pasien@example.com', isPatient: true, canDecide: false },
      ]);

      await expect(
        service.submitForApproval(DOCUMENT_ID, { approverIds: [APPROVER_ID] }, DRAFTER),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('refuses a second round while one is open', async () => {
      approvalRepositoryMock.findPendingRequestForDocument.mockResolvedValue(buildRound());

      await expect(
        service.submitForApproval(DOCUMENT_ID, { approverIds: [APPROVER_ID] }, DRAFTER),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses to submit anything that is not a draft', async () => {
      managedDocumentRepositoryMock.findVisibleById.mockResolvedValue(
        buildDocument({ status: 'ISSUED' }),
      );

      await expect(
        service.submitForApproval(DOCUMENT_ID, { approverIds: [APPROVER_ID] }, DRAFTER),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('issue', () => {
    it('refuses the direct issue when the type requires approval (FR-E5-11)', async () => {
      await expect(service.issue(DOCUMENT_ID, DRAFTER)).rejects.toBeInstanceOf(ConflictException);
      expect(managedDocumentRepositoryMock.issueDocument).not.toHaveBeenCalled();
    });

    it('issues directly when the type requires no approval (FR-E5-12)', async () => {
      managedDocumentRepositoryMock.findVisibleById.mockResolvedValue(
        buildDocument({
          type: { ...buildDocument().type, isApprovalRequired: false },
        }),
      );

      await service.issue(DOCUMENT_ID, DRAFTER);

      const actualCall = managedDocumentRepositoryMock.issueDocument.mock.calls[0]?.[0];
      expect(actualCall?.id).toBe(DOCUMENT_ID);
      expect(actualCall?.issuedAt).toBeInstanceOf(Date);
    });

    it('refuses to issue a type whose behaviour is not wired up yet', async () => {
      managedDocumentRepositoryMock.findVisibleById.mockResolvedValue(
        buildDocument({
          type: {
            ...buildDocument().type,
            isApprovalRequired: false,
            behavior: 'INVOICE_TEMPLATE',
          },
        }),
      );

      await expect(service.issue(DOCUMENT_ID, DRAFTER)).rejects.toBeInstanceOf(ConflictException);
      expect(managedDocumentRepositoryMock.issueDocument).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    beforeEach(() => {
      approvalRepositoryMock.findRequestById.mockResolvedValue(buildRound());
      approvalRepositoryMock.claimDecision.mockResolvedValue({
        isResolved: true,
        approvalCount: 1,
      });
    });

    it('releases the frozen version rather than the live row (FR-E5-16)', async () => {
      await service.approve(ROUND_ID, APPROVER);

      const actualClaim = approvalRepositoryMock.claimDecision.mock.calls[0][0];
      expect(actualClaim.frozenContent.contentHtml).toBe('<p>isi yang disetujui</p>');
      expect(actualClaim.frozenContent.documentId).toBe(DOCUMENT_ID);
    });

    it('refuses a caller who holds the key but was not named on the round', async () => {
      await expect(
        service.approve(ROUND_ID, { sub: OTHER_ID } as CurrentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(approvalRepositoryMock.claimDecision).not.toHaveBeenCalled();
    });

    it('refuses a drafter approving their own document when self-approval is off', async () => {
      approvalRepositoryMock.findRequestById.mockResolvedValue(
        buildRound({
          approvers: [
            { approverId: DRAFTER_ID, email: 'drafter@klinik.example', isEligible: true },
          ],
        }),
      );

      await expect(service.approve(ROUND_ID, DRAFTER)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a drafter to approve when the type turns self-approval on', async () => {
      managedDocumentRepositoryMock.findVisibleById.mockResolvedValue(
        buildDocument({ type: { ...buildDocument().type, allowSelfApproval: true } }),
      );
      approvalRepositoryMock.findRequestById.mockResolvedValue(
        buildRound({
          approvers: [
            { approverId: DRAFTER_ID, email: 'drafter@klinik.example', isEligible: true },
          ],
        }),
      );

      await service.approve(ROUND_ID, DRAFTER);

      expect(approvalRepositoryMock.claimDecision).toHaveBeenCalled();
    });

    it('tells the loser of a race that the round is already decided', async () => {
      approvalRepositoryMock.claimDecision.mockResolvedValue(null);

      await expect(service.approve(ROUND_ID, APPROVER)).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a round that has already resolved before the lock is taken', async () => {
      approvalRepositoryMock.findRequestById.mockResolvedValue(buildRound({ status: 'APPROVED' }));

      await expect(service.approve(ROUND_ID, APPROVER)).rejects.toBeInstanceOf(ConflictException);
    });

    it('records the issue verb on the approving path as well as the direct one', async () => {
      await service.approve(ROUND_ID, APPROVER);

      const actualActions = auditServiceMock.record.mock.calls.map((call) => call[0].action);
      expect(actualActions).toContain(AuditAction.APPROVAL_GRANTED);
      expect(actualActions).toContain(AuditAction.DOCUMENT_ISSUED);
    });

    it('does not announce a decision that did not resolve the round', async () => {
      approvalRepositoryMock.claimDecision.mockResolvedValue({
        isResolved: false,
        approvalCount: 1,
      });

      await service.approve(ROUND_ID, APPROVER);

      expect(notificationServiceMock.announce).not.toHaveBeenCalled();
    });
  });

  describe('bulkApprove (FR-E5-23)', () => {
    beforeEach(() => {
      approvalRepositoryMock.findRequestById.mockResolvedValue(buildRound());
      approvalRepositoryMock.claimDecision.mockResolvedValue({
        isResolved: true,
        approvalCount: 1,
        decisionId: 'decision-1',
      });
    });

    it('records a decision per request and counts them', async () => {
      const actual = await service.bulkApprove({ requestIds: ['round-1', 'round-2'] }, APPROVER);

      expect(actual.approvedCount).toBe(2);
      expect(actual.failedCount).toBe(0);
      expect(approvalRepositoryMock.claimDecision).toHaveBeenCalledTimes(2);
    });

    it('fails one ineligible item alone and leaves the rest standing', async () => {
      approvalRepositoryMock.findRequestById
        .mockResolvedValueOnce(buildRound())
        .mockResolvedValueOnce(buildRound({ approvers: [] }));

      const actual = await service.bulkApprove({ requestIds: ['round-1', 'round-2'] }, APPROVER);

      expect(actual.approvedCount).toBe(1);
      expect(actual.items[1]?.isApproved).toBe(false);
      expect(actual.items[1]?.error?.code).toBe('DOCUMENT_APPROVAL_NOT_AN_APPROVER');
    });

    it('reports the loser of a race as a failure rather than throwing the batch away', async () => {
      approvalRepositoryMock.claimDecision.mockResolvedValueOnce(null);

      const actual = await service.bulkApprove({ requestIds: ['round-1'] }, APPROVER);

      expect(actual.failedCount).toBe(1);
      expect(actual.items[0]?.error?.code).toBe('DOCUMENT_APPROVAL_ALREADY_DECIDED');
    });
  });

  describe('reject', () => {
    beforeEach(() => {
      approvalRepositoryMock.findRequestById.mockResolvedValue(buildRound());
      approvalRepositoryMock.claimDecision.mockResolvedValue({
        isResolved: true,
        approvalCount: 0,
      });
    });

    it('keeps the reason in the audit trail and in the drafter’s notification', async () => {
      const inputReason = 'Pasal 4 bertentangan dengan kebijakan pengembalian dana.';

      await service.reject(ROUND_ID, { reason: inputReason }, APPROVER);

      const actualAudit = auditServiceMock.record.mock.calls.find(
        (call) => call[0].action === AuditAction.APPROVAL_REJECTED,
      );
      expect(actualAudit?.[0].metadata.reason).toBe(inputReason);
      expect(notificationServiceMock.announce).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'REJECTED', reason: inputReason }),
      );
    });
  });

  describe('supersedeOpenRounds', () => {
    it('voids the round, returns the document to DRAFT and tells the approvers', async () => {
      const inputRound = buildRound();
      approvalRepositoryMock.findPendingRequestForDocument.mockResolvedValue(inputRound);

      const actual = await service.supersedeOpenRounds(buildDocument(), DRAFTER);

      expect(actual).toBe(true);
      expect(approvalRepositoryMock.supersedePendingForDocument).toHaveBeenCalledWith(DOCUMENT_ID);
      expect(managedDocumentRepositoryMock.transitionDocument).toHaveBeenCalledWith({
        id: DOCUMENT_ID,
        status: 'DRAFT',
      });
      expect(notificationServiceMock.announce).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'SUPERSEDED' }),
      );
    });

    it('does nothing when no round is open', async () => {
      const actual = await service.supersedeOpenRounds(buildDocument(), DRAFTER);

      expect(actual).toBe(false);
      expect(approvalRepositoryMock.supersedePendingForDocument).not.toHaveBeenCalled();
      expect(notificationServiceMock.announce).not.toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    it('ends the round without recording any decision (FR-E5-18)', async () => {
      approvalRepositoryMock.findPendingRequestForDocument.mockResolvedValue(buildRound());

      await service.withdraw(DOCUMENT_ID, DRAFTER);

      expect(approvalRepositoryMock.resolveWithoutDecision).toHaveBeenCalledWith(
        ROUND_ID,
        'WITHDRAWN',
      );
      expect(approvalRepositoryMock.claimDecision).not.toHaveBeenCalled();
    });

    it('refuses when there is nothing open to withdraw', async () => {
      await expect(service.withdraw(DOCUMENT_ID, DRAFTER)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});

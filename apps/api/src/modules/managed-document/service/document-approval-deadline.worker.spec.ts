import { ConfigService } from '@nestjs/config';

import { DocumentApprovalRepository } from '../repository/document-approval.repository';
import { DocumentApprovalDeadlineWorker } from './document-approval-deadline.worker';
import { DocumentApprovalNotificationService } from './document-approval-notification.service';

const REQUEST_ID = '55555555-5555-4555-8555-555555555555';
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444';
const APPROVER_ID = '22222222-2222-4222-8222-222222222222';
const DECIDED_APPROVER_ID = '33333333-3333-4333-8333-333333333333';

function buildCandidate() {
  return {
    requestId: REQUEST_ID,
    documentId: DOCUMENT_ID,
    documentTitle: 'Perjanjian',
    documentTypeName: 'Perjanjian pasien–klinik',
    dueAt: new Date('2026-10-03T10:00:00Z'),
    approverIds: [APPROVER_ID],
    submittedById: '11111111-1111-4111-8111-111111111111',
  };
}

function buildRound() {
  return {
    id: REQUEST_ID,
    documentId: DOCUMENT_ID,
    status: 'PENDING' as const,
    submittedBy: { id: '11111111-1111-4111-8111-111111111111', email: 'drafter@klinik.example' },
    submittedAt: new Date('2026-09-30T01:00:00Z'),
    dueAt: new Date('2026-10-03T10:00:00Z'),
    resolvedAt: null,
    dueSoonNotifiedAt: null,
    overdueNotifiedAt: null,
    approvers: [
      { approverId: APPROVER_ID, email: 'approver@klinik.example', isEligible: true },
      { approverId: DECIDED_APPROVER_ID, email: 'decided@klinik.example', isEligible: true },
    ],
    decisions: [
      {
        id: 'd1',
        approverId: DECIDED_APPROVER_ID,
        approverEmail: 'decided@klinik.example',
        isApproved: true,
        reason: null,
        decidedAt: new Date('2026-10-01T00:00:00Z'),
      },
    ],
    frozenPayload: {
      title: 'Perjanjian',
      documentNumber: null,
      contentHtml: '<p>isi</p>',
      storageKey: null,
      storageMimeType: null,
      storageSizeBytes: null,
      patientId: null,
      doctorId: null,
      approverIds: [APPROVER_ID, DECIDED_APPROVER_ID],
      frozenAt: '2026-09-30T01:00:00.000Z',
    },
  };
}

describe('DocumentApprovalDeadlineWorker', () => {
  const approvalRepositoryMock = {
    listDeadlineCandidates: jest.fn(),
    claimDeadlineNotice: jest.fn(),
    findRequestById: jest.fn(),
    // Deliberately present and deliberately never called: the sweep must not
    // be able to decide anything (FR-E5-28).
    claimDecision: jest.fn(),
    resolveWithoutDecision: jest.fn(),
    supersedePendingForDocument: jest.fn(),
  };
  const notificationServiceMock = { announce: jest.fn() };
  const configServiceMock = { get: jest.fn().mockReturnValue(undefined) };

  function buildWorker(): DocumentApprovalDeadlineWorker {
    return new DocumentApprovalDeadlineWorker(
      approvalRepositoryMock as unknown as DocumentApprovalRepository,
      notificationServiceMock as unknown as DocumentApprovalNotificationService,
      configServiceMock as unknown as ConfigService,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    approvalRepositoryMock.listDeadlineCandidates.mockResolvedValue([]);
    approvalRepositoryMock.findRequestById.mockResolvedValue(buildRound());
    approvalRepositoryMock.claimDeadlineNotice.mockResolvedValue(true);
  });

  it('sends one notice per round per kind and reports the count', async () => {
    approvalRepositoryMock.listDeadlineCandidates.mockResolvedValue([buildCandidate()]);

    const actual = await buildWorker().sweepOnce();

    // One DUE_SOON and one OVERDUE, because both thresholds match this round.
    expect(actual).toBe(2);
    expect(notificationServiceMock.announce).toHaveBeenCalledTimes(2);
  });

  it('sends nothing on a second tick, because the claim already fired', async () => {
    approvalRepositoryMock.listDeadlineCandidates.mockResolvedValue([buildCandidate()]);
    approvalRepositoryMock.claimDeadlineNotice.mockResolvedValue(false);

    const actual = await buildWorker().sweepOnce();

    expect(actual).toBe(0);
    expect(notificationServiceMock.announce).not.toHaveBeenCalled();
  });

  it('never records a decision — a deadline escalates, it does not decide', async () => {
    approvalRepositoryMock.listDeadlineCandidates.mockResolvedValue([buildCandidate()]);

    await buildWorker().sweepOnce();

    expect(approvalRepositoryMock.claimDecision).not.toHaveBeenCalled();
    expect(approvalRepositoryMock.resolveWithoutDecision).not.toHaveBeenCalled();
    expect(approvalRepositoryMock.supersedePendingForDocument).not.toHaveBeenCalled();
  });

  it('chases only approvers who have not answered', async () => {
    approvalRepositoryMock.listDeadlineCandidates.mockResolvedValue([buildCandidate()]);

    await buildWorker().sweepOnce();

    const actualRecipients = notificationServiceMock.announce.mock.calls[0][0].recipients;
    expect(actualRecipients).toEqual([
      { userId: APPROVER_ID, email: 'approver@klinik.example' },
    ]);
  });

  it('excludes an approver who has lost the decide key since submission', async () => {
    approvalRepositoryMock.listDeadlineCandidates.mockResolvedValue([buildCandidate()]);
    approvalRepositoryMock.findRequestById.mockResolvedValue({
      ...buildRound(),
      approvers: [
        { approverId: APPROVER_ID, email: 'approver@klinik.example', isEligible: false },
      ],
      decisions: [],
    });

    await buildWorker().sweepOnce();

    expect(notificationServiceMock.announce.mock.calls[0][0].recipients).toEqual([]);
  });

  it('swallows a repository failure rather than killing the interval', async () => {
    approvalRepositoryMock.listDeadlineCandidates.mockRejectedValue(new Error('db down'));

    await expect(buildWorker().sweepOnce()).resolves.toBe(0);
  });
});

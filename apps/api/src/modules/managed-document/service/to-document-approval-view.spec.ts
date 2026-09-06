import { DocumentApprovalRequestRecord } from '@hms/shared-types';

import {
  toDocumentApprovalRoundView,
  toManagedDocumentApprovalSummaryView,
} from './to-document-approval-view';

const NOW = new Date('2026-10-05T00:00:00Z');

function buildRound(
  overrides: Partial<DocumentApprovalRequestRecord> = {},
): DocumentApprovalRequestRecord {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    documentId: '44444444-4444-4444-8444-444444444444',
    status: 'PENDING',
    frozenPayload: {
      title: 'Perjanjian',
      documentNumber: null,
      contentHtml: '<p>isi</p>',
      storageKey: null,
      storageMimeType: null,
      storageSizeBytes: null,
      patientId: null,
      doctorId: null,
      approverIds: [],
      frozenAt: '2026-09-30T01:00:00.000Z',
    },
    submittedBy: { id: 'u1', email: 'drafter@klinik.example' },
    submittedAt: new Date('2026-09-30T01:00:00Z'),
    dueAt: null,
    resolvedAt: null,
    dueSoonNotifiedAt: null,
    overdueNotifiedAt: null,
    approvers: [{ approverId: 'a1', email: 'approver@klinik.example', isEligible: true }],
    decisions: [],
    ...overrides,
  };
}

describe('toDocumentApprovalRoundView', () => {
  it('flags an open round whose deadline has passed', () => {
    const actual = toDocumentApprovalRoundView(
      buildRound({ dueAt: new Date('2026-10-01T00:00:00Z') }),
      1,
      NOW,
    );

    expect(actual.isOverdue).toBe(true);
    // The deadline changed nothing about the round itself (FR-E5-28).
    expect(actual.status).toBe('PENDING');
  });

  it('never flags a resolved round as overdue, however late it was decided', () => {
    const actual = toDocumentApprovalRoundView(
      buildRound({
        status: 'APPROVED',
        dueAt: new Date('2026-10-01T00:00:00Z'),
        resolvedAt: new Date('2026-10-04T00:00:00Z'),
      }),
      1,
      NOW,
    );

    expect(actual.isOverdue).toBe(false);
  });

  it('flags a round nobody can decide any more', () => {
    const actual = toDocumentApprovalRoundView(
      buildRound({
        approvers: [{ approverId: 'a1', email: 'gone@klinik.example', isEligible: false }],
      }),
      1,
      NOW,
    );

    expect(actual.hasNoEligibleApprover).toBe(true);
  });

  it('does not flag a round where at least one approver still holds the key', () => {
    const actual = toDocumentApprovalRoundView(
      buildRound({
        approvers: [
          { approverId: 'a1', email: 'gone@klinik.example', isEligible: false },
          { approverId: 'a2', email: 'here@klinik.example', isEligible: true },
        ],
      }),
      1,
      NOW,
    );

    expect(actual.hasNoEligibleApprover).toBe(false);
  });

  it('counts approvals honestly against a multi-approval requirement', () => {
    const actual = toDocumentApprovalRoundView(
      buildRound({
        decisions: [
          {
            id: 'd1',
            approverId: 'a1',
            approverEmail: 'approver@klinik.example',
            isApproved: true,
            reason: null,
            decidedAt: new Date('2026-10-02T00:00:00Z'),
          },
        ],
      }),
      2,
      NOW,
    );

    expect(actual.approvalCount).toBe(1);
    expect(actual.requiredApprovals).toBe(2);
  });

  it('does not count a rejection towards the approval tally', () => {
    const actual = toDocumentApprovalRoundView(
      buildRound({
        status: 'REJECTED',
        decisions: [
          {
            id: 'd1',
            approverId: 'a1',
            approverEmail: 'approver@klinik.example',
            isApproved: false,
            reason: 'Pasal 4 salah',
            decidedAt: new Date('2026-10-02T00:00:00Z'),
          },
        ],
      }),
      1,
      NOW,
    );

    expect(actual.approvalCount).toBe(0);
    expect(actual.decisions.at(0)?.reason).toBe('Pasal 4 salah');
  });
});

describe('toManagedDocumentApprovalSummaryView', () => {
  it('agrees with the full round view on the two derived flags', () => {
    const inputRound = buildRound({
      dueAt: new Date('2026-10-01T00:00:00Z'),
      approvers: [{ approverId: 'a1', email: 'gone@klinik.example', isEligible: false }],
    });

    const actualSummary = toManagedDocumentApprovalSummaryView(inputRound, 1, NOW);
    const actualRound = toDocumentApprovalRoundView(inputRound, 1, NOW);

    expect(actualSummary.isOverdue).toBe(actualRound.isOverdue);
    expect(actualSummary.hasNoEligibleApprover).toBe(actualRound.hasNoEligibleApprover);
    expect(actualSummary.approverCount).toBe(actualRound.approvers.length);
  });
});

import type { ClinicDocumentApprovalView } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { canSubmitClinicDocument } from '#lib/clinic-documents/can-submit-clinic-document';

function buildApproval(
  status: ClinicDocumentApprovalView['status'],
): ClinicDocumentApprovalView {
  return {
    isApprovalRequired: true,
    managedDocumentId: status === null ? null : 'managed-1',
    status,
    pendingRound: null,
  };
}

describe('canSubmitClinicDocument', () => {
  it('offers a document that predates the policy and has no registry row', () => {
    expect(canSubmitClinicDocument(buildApproval(null))).toBe(true);
  });

  it('offers a draft, which is what an upload under an active policy produces', () => {
    // The reported dead end: the upload creates this row itself, and the old
    // control hid on exactly this state.
    expect(canSubmitClinicDocument(buildApproval('DRAFT'))).toBe(true);
  });

  it.each(['PENDING_APPROVAL', 'ISSUED', 'ARCHIVED'] as const)(
    'hides on %s, where submitting can only be refused',
    (status) => {
      expect(canSubmitClinicDocument(buildApproval(status))).toBe(false);
    },
  );
});

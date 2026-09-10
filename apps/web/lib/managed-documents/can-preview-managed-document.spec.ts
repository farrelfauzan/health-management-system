import type { ManagedDocumentDetailView } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { canPreviewManagedDocument } from './can-preview-managed-document';

function buildDocument(
  overrides: Partial<ManagedDocumentDetailView> = {},
): ManagedDocumentDetailView {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    type: {
      id: '00000000-0000-4000-8000-0000000000aa',
      code: 'CLINIC_CORPUS_DOCUMENT',
      name: 'Dokumen korpus',
      behavior: 'CLINIC_CORPUS',
      contentMode: 'UPLOADED',
    },
    status: 'PENDING_APPROVAL',
    title: 'Kebijakan rujukan',
    documentNumber: null,
    hasContentHtml: false,
    storageKey: 'documents/managed/kebijakan.md',
    storageMimeType: 'text/markdown',
    storageSizeBytes: 2_048,
    patient: null,
    doctor: null,
    subject: null,
    draftedBy: { id: '00000000-0000-4000-8000-0000000000bb', email: 'drafter@hms.local' },
    approval: null,
    issuedAt: null,
    createdAt: '2026-09-10T02:00:00.000Z',
    updatedAt: '2026-09-10T02:00:00.000Z',
    contentHtml: null,
    isApprovalRequired: true,
    allowSelfApproval: false,
    requiredApprovals: 1,
    defaultApprovers: [],
    ...overrides,
  };
}

describe('canPreviewManagedDocument', () => {
  it('previews an uploaded markdown body', () => {
    expect(canPreviewManagedDocument(buildDocument())).toBe(true);
  });

  it('previews an uploaded plain-text body', () => {
    expect(canPreviewManagedDocument(buildDocument({ storageMimeType: 'text/plain' }))).toBe(true);
  });

  it('refuses a PDF, which keeps the download it already had', () => {
    expect(canPreviewManagedDocument(buildDocument({ storageMimeType: 'application/pdf' }))).toBe(
      false,
    );
  });

  it('refuses an image', () => {
    expect(canPreviewManagedDocument(buildDocument({ storageMimeType: 'image/png' }))).toBe(false);
  });

  it('refuses a body drafted in the editor, which has no file', () => {
    expect(
      canPreviewManagedDocument(
        buildDocument({ storageKey: null, storageMimeType: null, contentHtml: '<p>isi</p>' }),
      ),
    ).toBe(false);
  });
});

import type { ManagedDocumentDetailView } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ManagedDocumentPreview } from './managed-document-preview';
import { managedDocumentControllerGetPreviewV1 } from '#lib/api/generated/documents/documents';
import messages from '../../../messages/en/operations.json';

vi.mock('#lib/api/generated/documents/documents', () => ({
  managedDocumentControllerGetPreviewV1: vi.fn(),
  managedDocumentControllerGetDownloadUrlV1: vi.fn(),
  getManagedDocumentControllerGetPreviewV1QueryKey: (id: string) => [
    '/api/v1/documents',
    id,
    'preview',
  ],
}));

const previewMock = vi.mocked(managedDocumentControllerGetPreviewV1);

const DOCUMENT_ID = '00000000-0000-4000-8000-000000000001';

function buildDocument(
  overrides: Partial<ManagedDocumentDetailView> = {},
): ManagedDocumentDetailView {
  return {
    id: DOCUMENT_ID,
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

function renderPreview(document: ManagedDocumentDetailView) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="en" timeZone="Asia/Jakarta" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <ManagedDocumentPreview document={document} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('ManagedDocumentPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the document text so an approver can read it before deciding', async () => {
    previewMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: {
          documentId: DOCUMENT_ID,
          mimeType: 'text/markdown',
          text: '# Kebijakan\n\nPasien wajib membawa kartu.',
          characterCount: 40,
          totalCharacterCount: 40,
          isTruncated: false,
        },
      },
    } as never);

    renderPreview(buildDocument());

    expect(await screen.findByText(/Pasien wajib membawa kartu\./)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the text as text, never as markup', async () => {
    previewMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: {
          documentId: DOCUMENT_ID,
          mimeType: 'text/markdown',
          text: '<b>tidak boleh menjadi markup</b>',
          characterCount: 32,
          totalCharacterCount: 32,
          isTruncated: false,
        },
      },
    } as never);

    const { container } = renderPreview(buildDocument());

    expect(await screen.findByText('<b>tidak boleh menjadi markup</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });

  it('says the document continues when the preview was truncated', async () => {
    previewMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: {
          documentId: DOCUMENT_ID,
          mimeType: 'text/markdown',
          text: 'awal dokumen',
          characterCount: 20_000,
          totalCharacterCount: 48_120,
          isTruncated: true,
        },
      },
    } as never);

    renderPreview(buildDocument());

    expect(
      await screen.findByText(/Showing the first 20,000 of 48,120 characters/),
    ).toBeInTheDocument();
  });

  it('tells the approver the text could not be loaded rather than showing an empty box', async () => {
    previewMock.mockRejectedValue(new Error('network down'));

    renderPreview(buildDocument());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /The document text could not be loaded/,
      );
    });
    expect(screen.queryByText(/Loading the document text/)).not.toBeInTheDocument();
  });

  it('distinguishes a document that read as blank from one that failed', async () => {
    previewMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: {
          documentId: DOCUMENT_ID,
          mimeType: 'text/plain',
          text: '   ',
          characterCount: 3,
          totalCharacterCount: 3,
          isTruncated: false,
        },
      },
    } as never);

    renderPreview(buildDocument());

    expect(await screen.findByText(/No text could be read from this file/)).toBeInTheDocument();
  });

  it('shows a loading line while the text is on its way', () => {
    previewMock.mockReturnValue(new Promise(() => undefined) as never);

    renderPreview(buildDocument());

    expect(screen.getByText(/Loading the document text/)).toBeInTheDocument();
  });

  it('renders nothing, and asks for nothing, for a PDF that keeps its download', () => {
    renderPreview(buildDocument({ storageMimeType: 'application/pdf' }));

    expect(screen.queryByTestId('managed-document-preview')).not.toBeInTheDocument();
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('renders nothing for a body drafted in the editor', () => {
    renderPreview(buildDocument({ storageKey: null, storageMimeType: null }));

    expect(screen.queryByTestId('managed-document-preview')).not.toBeInTheDocument();
    expect(previewMock).not.toHaveBeenCalled();
  });
});

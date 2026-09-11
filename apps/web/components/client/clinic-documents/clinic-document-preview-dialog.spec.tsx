import type { ClinicDocumentView } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClinicDocumentPreviewDialog } from './clinic-document-preview-dialog';
import {
  documentAdminControllerGetDownloadUrlV1,
  documentAdminControllerGetPreviewV1,
} from '#lib/api/generated/document-management/document-management';
import messages from '../../../messages/en/dashboard-ai.json';
import sharedMessages from '../../../messages/en/shared.json';

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  documentAdminControllerGetPreviewV1: vi.fn(),
  documentAdminControllerGetDownloadUrlV1: vi.fn(),
  getDocumentAdminControllerGetDownloadUrlV1QueryKey: (id: string) => [
    '/api/v1/admin/documents',
    id,
    'download',
  ],
  getDocumentAdminControllerGetPreviewV1QueryKey: (id: string) => [
    '/api/v1/admin/documents',
    id,
    'preview',
  ],
}));

// pdf.js cannot run in jsdom; the viewer has its own spec with react-pdf mocked.
vi.mock('#components/client/documents/pdf-document-viewer', () => ({
  PdfDocumentViewer: ({ url }: { url: string }) => <div>pdf viewer for {url}</div>,
}));

const previewMock = vi.mocked(documentAdminControllerGetPreviewV1);
const downloadUrlMock = vi.mocked(documentAdminControllerGetDownloadUrlV1);

const DOCUMENT_ID = '00000000-0000-4000-8000-000000000001';

function buildDocument(overrides: Partial<ClinicDocumentView> = {}): ClinicDocumentView {
  return {
    id: DOCUMENT_ID,
    ownerType: 'CLINIC',
    ownerId: null,
    purpose: 'FAQ',
    title: 'Jam layanan klinik',
    mimeType: 'text/markdown',
    sizeBytes: 1_024,
    visibility: 'PUBLIC',
    language: 'id',
    ingestStatus: 'READY',
    ingestError: null,
    ingestedAt: '2026-09-10T02:00:00.000Z',
    chunkCount: 3,
    uploadedById: '00000000-0000-4000-8000-0000000000bb',
    approval: {
      isApprovalRequired: false,
      managedDocumentId: null,
      status: null,
      pendingRound: null,
    },
    createdAt: '2026-09-10T02:00:00.000Z',
    updatedAt: '2026-09-10T02:00:00.000Z',
    ...overrides,
  } as ClinicDocumentView;
}

function mockPreview(
  overrides: {
    mimeType?: string;
    text?: string;
    characterCount?: number;
    totalCharacterCount?: number;
    isTruncated?: boolean;
  } = {},
) {
  const text = overrides.text ?? '# Kebijakan\n\n**Wajib** membawa kartu.';
  previewMock.mockResolvedValue({
    status: 200,
    headers: {},
    data: {
      data: {
        documentId: DOCUMENT_ID,
        mimeType: overrides.mimeType ?? 'text/markdown',
        text,
        characterCount: overrides.characterCount ?? text.length,
        totalCharacterCount: overrides.totalCharacterCount ?? text.length,
        isTruncated: overrides.isTruncated ?? false,
      },
    },
  } as never);
}

function renderDialog(
  document: ClinicDocumentView,
  props: { open?: boolean; onDownload?: () => void; onOpenChange?: (open: boolean) => void } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider
      locale="en"
      timeZone="Asia/Jakarta"
      messages={{ ...messages, ...sharedMessages }}
    >
      <QueryClientProvider client={queryClient}>
        <ClinicDocumentPreviewDialog
          open={props.open ?? true}
          onOpenChange={props.onOpenChange ?? vi.fn()}
          document={document}
          onDownload={props.onDownload ?? vi.fn()}
          isDownloadPending={false}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('ClinicDocumentPreviewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a Markdown document as formatted content', async () => {
    mockPreview();

    renderDialog(buildDocument());

    expect(await screen.findByRole('heading', { name: 'Kebijakan' })).toBeInTheDocument();
    expect(screen.getByText('Wajib').tagName).toBe('STRONG');
    expect(screen.getByText(/Rendered from the Markdown file/)).toBeInTheDocument();
  });

  it('shows a plain-text document exactly as stored, without rendering it', async () => {
    mockPreview({ mimeType: 'text/plain', text: '# bukan judul' });

    renderDialog(buildDocument({ mimeType: 'text/plain' }));

    expect(await screen.findByText('# bukan judul')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'bukan judul' })).not.toBeInTheDocument();
  });

  it('says the document continues when the preview was cut off', async () => {
    mockPreview({ characterCount: 20_000, totalCharacterCount: 45_000, isTruncated: true });

    renderDialog(buildDocument());

    expect(
      await screen.findByText(/Showing the first 20,000 of 45,000 characters/),
    ).toBeInTheDocument();
  });

  it('tells a failed load apart from an empty document', async () => {
    previewMock.mockRejectedValue(new Error('network down'));

    renderDialog(buildDocument());

    expect(await screen.findByText(/Unable to load this document/)).toBeInTheDocument();
  });

  it('renders a PDF through the page viewer from a fresh signed link, not the text preview', async () => {
    downloadUrlMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: { url: 'https://signed.example/doc.pdf', expiresAt: '2026-09-11T10:00:00.000Z' },
      },
    } as never);

    renderDialog(buildDocument({ mimeType: 'application/pdf' }));

    expect(
      await screen.findByText('pdf viewer for https://signed.example/doc.pdf'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Shown page by page/)).toBeInTheDocument();
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('fetches nothing while it is closed', () => {
    renderDialog(buildDocument(), { open: false });

    expect(previewMock).not.toHaveBeenCalled();
  });

  it('downloads and closes from the footer', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    const onOpenChange = vi.fn();
    mockPreview();
    renderDialog(buildDocument(), { onDownload, onOpenChange });

    await screen.findByRole('heading', { name: 'Kebijakan' });
    await user.click(screen.getByRole('button', { name: 'Download' }));
    await user.click(screen.getAllByRole('button', { name: 'Close' })[0] as HTMLElement);

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

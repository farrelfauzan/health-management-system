import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardAiMessages } from '#lib/dashboard/localization';

const listDocumentsMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  documentAdminControllerListDocumentsV1: listDocumentsMock,
  documentAdminControllerCreateUploadUrlV1: vi.fn(),
  documentAdminControllerConfirmUploadV1: vi.fn(),
  documentAdminControllerUpdateDocumentV1: vi.fn(),
  documentAdminControllerDeleteDocumentV1: vi.fn(),
  documentAdminControllerGetDownloadUrlV1: vi.fn(),
  documentAdminControllerReingestDocumentV1: vi.fn(),
  getDocumentAdminControllerListDocumentsV1QueryKey: () => ['clinic-documents'],
}));

const { ClinicCorpusPanel } = await import('./clinic-corpus-panel');

function buildDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'doc-1',
    ownerType: 'CLINIC',
    ownerId: null,
    purpose: 'FAQ_KNOWLEDGE_BASE',
    title: 'Jam Buka Poliklinik',
    mimeType: 'text/markdown',
    sizeBytes: 4096,
    visibility: 'BOTH',
    language: 'ID',
    ingestStatus: 'READY',
    ingestError: null,
    ingestedAt: '2026-08-06T09:07:41.000Z',
    chunkCount: 12,
    uploadedById: 'user-1',
    // Policy off — the default, so the approval column stays empty (US-E5-06).
    approval: {
      isApprovalRequired: false,
      managedDocumentId: null,
      status: null,
      pendingRound: null,
    },
    createdAt: '2026-08-06T09:05:12.000Z',
    updatedAt: '2026-08-06T09:07:41.000Z',
    ...overrides,
  };
}

function renderPanel(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={getDashboardAiMessages('id')}>
        <ClinicCorpusPanel />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('ClinicCorpusPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDocumentsMock.mockResolvedValue({ status: 200, data: { data: [buildDocument()] } });
  });

  it('lists only the FAQ corpus, never a stored-but-never-embedded document', async () => {
    renderPanel();

    await screen.findByText('Jam Buka Poliklinik');
    // A GENERAL clinic document is stored and never embedded, so listing it on
    // a knowledge-base screen would offer a reprocess that can only be
    // refused. The filter is pinned in the panel, not left to the user.
    expect(listDocumentsMock).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'FAQ_KNOWLEDGE_BASE' }),
      expect.anything(),
    );
  });

  it('says who a patient-reachable document can be shown to', async () => {
    renderPanel();

    // The one column with a consequence outside the clinic: this document can
    // be quoted to a stranger on WhatsApp.
    expect(await screen.findByText('Pasien dan staf')).toBeInTheDocument();
  });

  it('marks a staff-only document as staff-only', async () => {
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildDocument({ visibility: 'DOCTOR', title: 'SOP Eskalasi Internal' })] },
    });
    renderPanel();

    expect(await screen.findByText('Staf saja')).toBeInTheDocument();
  });

  it('marks a READY document as answerable', async () => {
    renderPanel();

    expect(await screen.findByText('Siap')).toBeInTheDocument();
    expect(screen.queryByText(/belum bisa dipakai menjawab/i)).not.toBeInTheDocument();
  });

  it.each([
    ['PENDING', 'Menunggu diproses'],
    ['PROCESSING', 'Sedang diproses'],
  ])('says nothing can be answered from it yet while %s', async (ingestStatus, label) => {
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildDocument({ ingestStatus, chunkCount: 0 })] },
    });
    renderPanel();

    expect(await screen.findByText(label)).toBeInTheDocument();
    // Uploaded is not the same as retrievable. An admin who uploaded the
    // clinic's opening hours must not assume the bot started using them.
    expect(screen.getByText(/belum bisa dipakai menjawab/i)).toBeInTheDocument();
  });

  it('shows the ingest error on a failed document instead of an empty state', async () => {
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: {
        data: [
          buildDocument({
            ingestStatus: 'FAILED',
            ingestError: 'No text could be extracted from this document',
            chunkCount: 0,
          }),
        ],
      },
    });
    renderPanel();

    expect(await screen.findByText('Gagal')).toBeInTheDocument();
    expect(
      screen.getByText(/No text could be extracted from this document/i),
    ).toBeInTheDocument();
  });

  it('renders an empty state when no document matches the filters', async () => {
    listDocumentsMock.mockResolvedValue({ status: 200, data: { data: [] } });
    renderPanel();

    expect(await screen.findByText(/Tidak ada dokumen yang cocok/i)).toBeInTheDocument();
  });
});

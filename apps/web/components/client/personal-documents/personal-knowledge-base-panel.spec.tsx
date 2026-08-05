import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardAiMessages } from '#lib/dashboard/localization';

const listDocumentsMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  personalDocumentControllerListDocumentsV1: listDocumentsMock,
  personalDocumentControllerCreateUploadUrlV1: vi.fn(),
  personalDocumentControllerConfirmUploadV1: vi.fn(),
  personalDocumentControllerUpdateDocumentV1: vi.fn(),
  personalDocumentControllerDeleteDocumentV1: vi.fn(),
  personalDocumentControllerGetDownloadUrlV1: vi.fn(),
  personalDocumentControllerReingestDocumentV1: vi.fn(),
  getPersonalDocumentControllerListDocumentsV1QueryKey: () => ['personal-documents'],
}));

const { PersonalKnowledgeBasePanel } = await import('./personal-knowledge-base-panel');

function buildDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'doc-1',
    ownerType: 'DOCTOR',
    ownerId: 'user-1',
    purpose: 'PERSONAL_KNOWLEDGE_BASE',
    title: 'Panduan Tatalaksana Hipertensi',
    mimeType: 'application/pdf',
    sizeBytes: 96256,
    language: 'ID',
    ingestStatus: 'READY',
    ingestError: null,
    ingestedAt: '2026-08-05T09:07:41.000Z',
    chunkCount: 24,
    createdAt: '2026-08-05T09:05:12.000Z',
    updatedAt: '2026-08-05T09:07:41.000Z',
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
        <PersonalKnowledgeBasePanel />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('PersonalKnowledgeBasePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDocumentsMock.mockResolvedValue({ status: 200, data: { data: [buildDocument()] } });
  });

  it('shows the no-patient-data notice on the list, not only in the dialog', async () => {
    renderPanel();

    expect(await screen.findByText(/Jangan simpan data pasien/i)).toBeInTheDocument();
  });

  it('marks a READY document as answerable', async () => {
    renderPanel();

    expect(await screen.findByText('Siap')).toBeInTheDocument();
    expect(screen.queryByText(/belum bisa menjawab/i)).not.toBeInTheDocument();
  });

  it.each([['PENDING', 'Menunggu diproses'], ['PROCESSING', 'Sedang diproses']])(
    'says the assistant cannot answer yet while %s',
    async (ingestStatus, label) => {
      listDocumentsMock.mockResolvedValue({
        status: 200,
        data: { data: [buildDocument({ ingestStatus, chunkCount: 0 })] },
      });
      renderPanel();

      expect(await screen.findByText(label)).toBeInTheDocument();
      // The load-bearing claim: uploaded is not the same as retrievable, and a
      // clinician must not assume the assistant is already using this.
      expect(screen.getByText(/belum bisa menjawab/i)).toBeInTheDocument();
    },
  );

  it('shows the ingest error on a failed document instead of an empty state', async () => {
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: {
        data: [
          buildDocument({
            ingestStatus: 'FAILED',
            ingestError: 'Extraction failed: the PDF has no extractable text layer',
            chunkCount: 0,
          }),
        ],
      },
    });
    renderPanel();

    expect(await screen.findByText('Gagal')).toBeInTheDocument();
    expect(
      screen.getByText(/the PDF has no extractable text layer/i),
    ).toBeInTheDocument();
  });

  it('renders an empty state when nothing has been uploaded', async () => {
    listDocumentsMock.mockResolvedValue({ status: 200, data: { data: [] } });
    renderPanel();

    expect(await screen.findByText(/belum mengunggah dokumen/i)).toBeInTheDocument();
  });
});

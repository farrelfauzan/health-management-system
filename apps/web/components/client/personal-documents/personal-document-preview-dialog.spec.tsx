import type { PersonalDocumentView } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PersonalDocumentPreviewDialog } from './personal-document-preview-dialog';
import { personalDocumentControllerGetPreviewV1 } from '#lib/api/generated/document-management/document-management';
import messages from '../../../messages/en/dashboard-ai.json';
import sharedMessages from '../../../messages/en/shared.json';

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  personalDocumentControllerGetPreviewV1: vi.fn(),
  getPersonalDocumentControllerGetPreviewV1QueryKey: (id: string) => [
    '/api/v1/me/documents',
    id,
    'preview',
  ],
}));

const previewMock = vi.mocked(personalDocumentControllerGetPreviewV1);

const DOCUMENT_ID = '00000000-0000-4000-8000-000000000002';

function buildDocument(overrides: Partial<PersonalDocumentView> = {}): PersonalDocumentView {
  return {
    id: DOCUMENT_ID,
    ownerType: 'DOCTOR',
    ownerId: '00000000-0000-4000-8000-0000000000dd',
    purpose: 'PERSONAL_KNOWLEDGE_BASE',
    title: 'Catatan dosis anak',
    mimeType: 'text/markdown',
    sizeBytes: 512,
    language: 'id',
    ingestStatus: 'READY',
    ingestError: null,
    ingestedAt: '2026-09-10T02:00:00.000Z',
    chunkCount: 2,
    createdAt: '2026-09-10T02:00:00.000Z',
    updatedAt: '2026-09-10T02:00:00.000Z',
    ...overrides,
  } as PersonalDocumentView;
}

function mockPreview(mimeType: string, text: string) {
  previewMock.mockResolvedValue({
    status: 200,
    headers: {},
    data: {
      data: {
        documentId: DOCUMENT_ID,
        mimeType,
        text,
        characterCount: text.length,
        totalCharacterCount: text.length,
        isTruncated: false,
      },
    },
  } as never);
}

function renderDialog(document: PersonalDocumentView, open = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider
      locale="en"
      timeZone="Asia/Jakarta"
      messages={{ ...messages, ...sharedMessages }}
    >
      <QueryClientProvider client={queryClient}>
        <PersonalDocumentPreviewDialog
          open={open}
          onOpenChange={vi.fn()}
          document={document}
          onDownload={vi.fn()}
          isDownloadPending={false}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('PersonalDocumentPreviewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads my own document through my endpoint and renders the Markdown', async () => {
    mockPreview('text/markdown', '# Dosis\n\nAmoksisilin **25–45 mg/kg/hari**.');

    renderDialog(buildDocument());

    expect(await screen.findByRole('heading', { name: 'Dosis' })).toBeInTheDocument();
    expect(screen.getByText('25–45 mg/kg/hari').tagName).toBe('STRONG');
    expect(previewMock).toHaveBeenCalledWith(DOCUMENT_ID, expect.anything());
  });

  it('shows a plain-text document exactly as stored', async () => {
    mockPreview('text/plain', '# bukan judul');

    renderDialog(buildDocument({ mimeType: 'text/plain' }));

    expect(await screen.findByText('# bukan judul')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'bukan judul' })).not.toBeInTheDocument();
  });

  it('fetches nothing while it is closed', () => {
    renderDialog(buildDocument(), false);

    expect(previewMock).not.toHaveBeenCalled();
  });
});

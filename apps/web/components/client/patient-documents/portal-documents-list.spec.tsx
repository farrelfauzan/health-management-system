import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en/clinical.json';

const listPortalDocumentsMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  portalDocumentControllerListPortalDocumentsV1: listPortalDocumentsMock,
  patientDocumentDetailControllerGetDownloadUrlV1: vi.fn(),
  getPortalDocumentControllerListPortalDocumentsV1QueryKey: (params?: unknown) => [
    'portal-documents',
    ...(params ? [params] : []),
  ],
}));

const { PortalDocumentsList } = await import('./portal-documents-list');

function buildPortalDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'doc-1',
    category: 'LAB_RESULT',
    title: 'Hasil Lab Darah',
    mimeType: 'application/pdf',
    sizeBytes: 4096,
    documentDate: '2026-09-01',
    releasedAt: '2026-09-02T03:00:00.000Z',
    createdAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <PortalDocumentsList />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('PortalDocumentsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPortalDocumentsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildPortalDocument()], meta: { nextCursor: null } },
    });
  });

  it('lists the released documents with the date the clinic shared them', async () => {
    renderList();

    expect(await screen.findByText('Hasil Lab Darah')).toBeInTheDocument();
    expect(screen.getByText(/Shared on/)).toBeInTheDocument();
  });

  it('explains why the list is empty rather than just saying it is', async () => {
    // A patient who has had blood drawn and sees an empty page needs to know
    // the result exists and is not shared yet — not to conclude it was lost.
    listPortalDocumentsMock.mockResolvedValue({
      status: 200,
      data: { data: [], meta: { nextCursor: null } },
    });
    renderList();

    expect(await screen.findByText('Nothing shared yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Documents appear here once your clinic releases them to you/),
    ).toBeInTheDocument();
  });

  it('shows nothing that belongs to the staff view', async () => {
    // `PortalDocumentView` carries no notes, no uploader and no internal ids,
    // so there is nothing here to leak — this pins that the component did not
    // start reaching for fields the narrow view does not have.
    renderList();
    await screen.findByText('Hasil Lab Darah');

    expect(screen.queryByText(/perawat@/)).not.toBeInTheDocument();
    expect(screen.queryByText(/patient-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Release/)).not.toBeInTheDocument();
  });

  it('says downloads are not previewed in the browser', async () => {
    // §7.2.6: no inline preview in v1, and a download that silently does
    // nothing on a phone is worse than one that warned.
    renderList();

    expect(
      await screen.findByText(/Documents open as downloads/),
    ).toBeInTheDocument();
  });

  it('surfaces a load failure', async () => {
    listPortalDocumentsMock.mockRejectedValue(new Error('network'));
    renderList();

    expect(await screen.findByText('Unable to load your documents.')).toBeInTheDocument();
  });
});

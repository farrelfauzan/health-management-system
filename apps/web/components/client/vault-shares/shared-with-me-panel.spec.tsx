import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idMessages from '../../../messages/id/vault.json';

const listSharedWithMeMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  sharedWithMeDocumentControllerListSharedWithMeV1: listSharedWithMeMock,
  sharedWithMeDocumentControllerGetSharedDownloadUrlV1: vi.fn(),
  getSharedWithMeDocumentControllerListSharedWithMeV1QueryKey: () => ['shared-with-me'],
}));

const { SharedWithMePanel } = await import('./shared-with-me-panel');

function buildSharedDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'doc-1',
    title: 'STR Dokter Umum',
    mimeType: 'application/pdf',
    sizeBytes: 148480,
    sharedByEmail: 'dokter@example.test',
    sharedAt: '2026-09-03T09:10:00.000Z',
    expiresAt: null,
    ...overrides,
  };
}

function renderPanel(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={idMessages}>
        <SharedWithMePanel />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('SharedWithMePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSharedWithMeMock.mockResolvedValue({
      status: 200,
      data: { data: [buildSharedDocument()] },
    });
  });

  it('renders exactly one action — download — for a shared document', async () => {
    // US-E3-05, FR-E3-14. No rename, no delete, no re-share. There is nothing
    // suppressed here: the routes behind those actions are owner-scoped, and a
    // shared document is not in the set they query.
    renderPanel();

    expect(await screen.findByText('STR Dokter Umum')).toBeInTheDocument();
    const actions = screen.getAllByRole('button');
    expect(actions).toHaveLength(1);
    expect(actions[0]).toHaveTextContent(idMessages.vault.sharedWithMe.download);
  });

  it('shows who shared it and nothing about how they file their own paperwork', async () => {
    renderPanel();

    expect(await screen.findByText('dokter@example.test')).toBeInTheDocument();
    // The owner's private notes to themselves never travel with a shared
    // document.
    expect(
      screen.queryByText(idMessages.vault.categories.REGISTRATION_LICENCE),
    ).not.toBeInTheDocument();
  });

  it('treats an empty list as a normal state rather than an error', async () => {
    listSharedWithMeMock.mockResolvedValue({ status: 200, data: { data: [] } });
    renderPanel();

    expect(
      await screen.findByText(idMessages.vault.sharedWithMe.states.emptyTitle),
    ).toBeInTheDocument();
    expect(screen.queryByText(idMessages.vault.sharedWithMe.states.error)).not.toBeInTheDocument();
  });
});

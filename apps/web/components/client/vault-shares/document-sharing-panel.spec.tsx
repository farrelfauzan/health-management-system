import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idMessages from '../../../messages/id/vault.json';

const listSharesMock = vi.hoisted(() => vi.fn());
const revokeShareMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  vaultDocumentShareControllerListSharesV1: listSharesMock,
  vaultDocumentShareControllerRevokeShareV1: revokeShareMock,
  vaultDocumentShareControllerCreateShareV1: vi.fn(),
  vaultDocumentShareControllerListShareRecipientsV1: vi.fn(),
  getVaultDocumentShareControllerListSharesV1QueryKey: (id: string) => ['shares', id],
  getSharedWithMeDocumentControllerListSharedWithMeV1QueryKey: () => ['shared-with-me'],
}));

const { DocumentSharingPanel } = await import('./document-sharing-panel');

const DOCUMENT = {
  id: 'doc-1',
  title: 'STR Dokter Umum',
  mimeType: 'application/pdf',
  sizeBytes: 148480,
  language: 'ID',
  vaultCategory: 'REGISTRATION_LICENCE',
  referenceNumber: 'STR-EXAMPLE-0000',
  issuedAt: '2024-03-14',
  expiresAt: '2029-03-14',
  createdAt: '2026-09-03T09:00:00.000Z',
  updatedAt: '2026-09-03T09:00:00.000Z',
} as never;

function buildShare(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'share-1',
    documentId: 'doc-1',
    granteeId: 'grantee-1',
    granteeEmail: 'admin-satu@example.test',
    expiresAt: null,
    revokedAt: null,
    lastAccessedAt: null,
    openCount: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    isLive: true,
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
        <DocumentSharingPanel
          open
          onOpenChange={() => {}}
          document={DOCUMENT}
          onResult={() => {}}
          onError={() => {}}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('DocumentSharingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revokeShareMock.mockResolvedValue({ status: 200, data: { data: { id: 'share-1' } } });
  });

  it('shows both recipients with their open counts and a revoke action each', async () => {
    // US-E3-06. Being able to watch the door is what makes people willing to
    // open it, so the counts are the substance of this panel.
    listSharesMock.mockResolvedValue({
      status: 200,
      data: {
        data: [
          buildShare({ openCount: 2, lastAccessedAt: '2026-09-02T11:00:00.000Z' }),
          buildShare({ id: 'share-2', granteeEmail: 'admin-dua@example.test' }),
        ],
      },
    });
    renderPanel();

    expect(await screen.findByText('admin-satu@example.test')).toBeInTheDocument();
    expect(screen.getByText('admin-dua@example.test')).toBeInTheDocument();
    expect(screen.getByText(/2 kali/)).toBeInTheDocument();
    expect(screen.getByText(idMessages.vault.sharing.row.neverOpened)).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: idMessages.vault.sharing.row.revoke }),
    ).toHaveLength(2);
  });

  it('revokes one recipient without touching the other', async () => {
    listSharesMock.mockResolvedValue({
      status: 200,
      data: {
        data: [buildShare(), buildShare({ id: 'share-2', granteeEmail: 'admin-dua@example.test' })],
      },
    });
    renderPanel();

    const revokeButtons = await screen.findAllByRole('button', {
      name: idMessages.vault.sharing.row.revoke,
    });
    await userEvent.click(revokeButtons[0]!);

    expect(revokeShareMock).toHaveBeenCalledTimes(1);
    expect(revokeShareMock).toHaveBeenCalledWith('doc-1', 'share-1');
  });

  it('keeps a revoked share listed, with no revoke action, so the owner can confirm it', async () => {
    listSharesMock.mockResolvedValue({
      status: 200,
      data: { data: [buildShare({ isLive: false, revokedAt: '2026-09-02T00:00:00.000Z' })] },
    });
    renderPanel();

    expect(await screen.findByText(idMessages.vault.sharing.row.revoked)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: idMessages.vault.sharing.row.revoke }),
    ).not.toBeInTheDocument();
  });

  it('surfaces an open-ended share that has been standing for months', async () => {
    // FR-E3-20. Standing shares visible, not buried.
    listSharesMock.mockResolvedValue({
      status: 200,
      data: { data: [buildShare({ createdAt: '2026-01-01T00:00:00.000Z' })] },
    });
    renderPanel();

    expect(await screen.findByText(idMessages.vault.sharing.row.standing)).toBeInTheDocument();
  });
});

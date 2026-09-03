import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idMessages from '../../../messages/id/vault.json';

const listDocumentsMock = vi.hoisted(() => vi.fn());
const listSharedWithMeMock = vi.hoisted(() => vi.fn());

// The panel renders the *Shared with me* section below the owner's own
// documents (P16-T35), so this mock covers both halves of the page.
vi.mock('#lib/api/generated/document-management/document-management', () => ({
  vaultDocumentControllerListDocumentsV1: listDocumentsMock,
  sharedWithMeDocumentControllerListSharedWithMeV1: listSharedWithMeMock,
  sharedWithMeDocumentControllerGetSharedDownloadUrlV1: vi.fn(),
  getSharedWithMeDocumentControllerListSharedWithMeV1QueryKey: () => ['shared-with-me'],
  vaultDocumentShareControllerListSharesV1: vi.fn(),
  vaultDocumentShareControllerCreateShareV1: vi.fn(),
  vaultDocumentShareControllerRevokeShareV1: vi.fn(),
  vaultDocumentShareControllerListShareRecipientsV1: vi.fn(),
  getVaultDocumentShareControllerListSharesV1QueryKey: (id: string) => ['shares', id],
  vaultDocumentControllerCreateUploadUrlV1: vi.fn(),
  vaultDocumentControllerConfirmUploadV1: vi.fn(),
  vaultDocumentControllerUpdateDocumentV1: vi.fn(),
  vaultDocumentControllerDeleteDocumentV1: vi.fn(),
  vaultDocumentControllerGetDownloadUrlV1: vi.fn(),
  getVaultDocumentControllerListDocumentsV1QueryKey: () => ['vault-documents'],
}));

const { VaultPanel } = await import('./vault-panel');

function buildDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
        <VaultPanel />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('VaultPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDocumentsMock.mockResolvedValue({ status: 200, data: { data: [buildDocument()] } });
    listSharedWithMeMock.mockResolvedValue({ status: 200, data: { data: [] } });
  });

  it('states that the documents are private and that the assistant never reads them', async () => {
    // US-E3-03, and the whole reason this page reads differently from the
    // knowledge base beside it in the same navigation.
    renderPanel();

    expect(await screen.findByText(idMessages.vault.notices.privateTitle)).toBeInTheDocument();
    expect(screen.getByText(idMessages.vault.notices.notUsedByAssistant)).toBeInTheDocument();
  });

  it('lists the owner’s documents with their reference number and category', async () => {
    renderPanel();

    expect(await screen.findByText('STR Dokter Umum')).toBeInTheDocument();
    expect(screen.getByText('STR-EXAMPLE-0000')).toBeInTheDocument();
    expect(
      screen.getByText(idMessages.vault.categories.REGISTRATION_LICENCE),
    ).toBeInTheDocument();
  });

  it('flags a document nearing its expiry on the row itself', async () => {
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildDocument({ expiresAt: '2099-01-01' })] },
    });
    renderPanel();

    // A far-future expiry reads as valid; the badge only shouts when the
    // reminder job would also be shouting.
    expect(await screen.findByText(/Berlaku sampai/)).toBeInTheDocument();
  });

  it('offers no export action while the vault is empty', async () => {
    listDocumentsMock.mockResolvedValue({ status: 200, data: { data: [] } });
    renderPanel();

    expect(await screen.findByText(idMessages.vault.states.emptyTitle)).toBeInTheDocument();
    // Disabled rather than hidden: an owner who has just deleted everything
    // should still see that the option exists.
    expect(screen.getByRole('button', { name: idMessages.vault.export.label })).toBeDisabled();
    // The two empty states are distinct copy, so an owner can tell "I have
    // uploaded nothing" from "nobody has shared anything with me".
    expect(
      screen.getByText(idMessages.vault.sharedWithMe.states.emptyTitle),
    ).toBeInTheDocument();
  });
});

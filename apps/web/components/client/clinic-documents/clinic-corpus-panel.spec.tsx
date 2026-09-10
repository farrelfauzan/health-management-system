import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardAiMessages } from '#lib/dashboard/localization';
import idAuthShellMessages from '../../../messages/id/auth-shell.json';

const listDocumentsMock = vi.hoisted(() => vi.fn());
const sendForReviewMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  documentAdminControllerListDocumentsV1: listDocumentsMock,
  documentAdminControllerCreateUploadUrlV1: vi.fn(),
  documentAdminControllerConfirmUploadV1: vi.fn(),
  documentAdminControllerUpdateDocumentV1: vi.fn(),
  documentAdminControllerDeleteDocumentV1: vi.fn(),
  documentAdminControllerGetDownloadUrlV1: vi.fn(),
  documentAdminControllerReingestDocumentV1: vi.fn(),
  documentAdminControllerSendDocumentForReviewV1: sendForReviewMock,
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
      <NextIntlClientProvider
        locale="id"
        messages={{ ...getDashboardAiMessages('id'), ...idAuthShellMessages }}
      >
        <ClinicCorpusPanel />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const approvalMessages = getDashboardAiMessages('id').clinicCorpus.approval;
const reviewConfirm = approvalMessages.confirm.sendForReview;

async function openSendForReviewDialog(): Promise<HTMLElement> {
  await screen.findByText('Jam Buka Poliklinik');
  await userEvent.click(screen.getByRole('button', { name: approvalMessages.sendForReview }));
  return screen.findByRole('dialog');
}

describe('ClinicCorpusPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDocumentsMock.mockResolvedValue({ status: 200, data: { data: [buildDocument()] } });
    sendForReviewMock.mockResolvedValue({ status: 200, data: { data: { id: 'doc-1' } } });
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
    expect(screen.getByText(/No text could be extracted from this document/i)).toBeInTheDocument();
  });

  it('renders an empty state when no document matches the filters', async () => {
    listDocumentsMock.mockResolvedValue({ status: 200, data: { data: [] } });
    renderPanel();

    expect(await screen.findByText(/Tidak ada dokumen yang cocok/i)).toBeInTheDocument();
  });

  // The row actions are icons now, so the glyph carries no text and the
  // accessible name is the only thing naming the button. If these queries ever
  // fail, the row has become five unlabelled buttons for a screen reader,
  // which is exactly the failure icon-only controls invite.
  it('names every row action even though the buttons are icon-only', async () => {
    renderPanel();
    await screen.findByText('Jam Buka Poliklinik');

    for (const label of [
      'Unduh',
      'Ubah',
      'Proses ulang',
      'Pensiunkan',
      approvalMessages.sendForReview,
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      // No visible action text left to read, which is the point of the change.
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('hides the review action once the document already has a registry row', async () => {
    // Sending for review is the fix for a document that predates the policy.
    // One already tracked has nothing to send, and offering it would be an
    // action that can only be refused.
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: {
        data: [
          buildDocument({
            approval: {
              isApprovalRequired: true,
              managedDocumentId: 'managed-1',
              status: 'ISSUED',
              pendingRound: null,
            },
          }),
        ],
      },
    });
    renderPanel();
    await screen.findByText('Jam Buka Poliklinik');

    expect(
      screen.queryByRole('button', { name: approvalMessages.sendForReview }),
    ).not.toBeInTheDocument();
  });

  it('asks about a review send in the app, not through the browser’s own confirm', async () => {
    // window.confirm is unstyled, unlocalised in its own buttons, says the
    // origin rather than the product above copy the reader is meant to trust,
    // and Chrome suppresses it after a few in a row — at which point the send
    // goes unconfirmed.
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderPanel();

    const dialog = await openSendForReviewDialog();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(within(dialog).getByText(reviewConfirm.title)).toBeInTheDocument();
    // The copy names the document and the consequence an admin does not expect
    // from a button called "review": the assistant goes quiet about it.
    expect(within(dialog).getByText(/Jam Buka Poliklinik/)).toBeInTheDocument();
    expect(within(dialog).getByText(/sampai ada yang menyetujuinya/)).toBeInTheDocument();
    // Reflex-pressing Enter must not send anything.
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: reviewConfirm.cancel })).toHaveFocus(),
    );
  });

  it('sends nothing when the admin backs out of the review dialog', async () => {
    renderPanel();
    const dialog = await openSendForReviewDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: reviewConfirm.cancel }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sendForReviewMock).not.toHaveBeenCalled();
  });

  it('sends the document for review once when the admin confirms, and says so', async () => {
    renderPanel();
    const dialog = await openSendForReviewDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: reviewConfirm.confirm }));

    await waitFor(() => expect(sendForReviewMock).toHaveBeenCalledTimes(1));
    expect(sendForReviewMock).toHaveBeenCalledWith('doc-1');
    expect(await screen.findByText(approvalMessages.success.sendForReview)).toBeInTheDocument();
  });
});

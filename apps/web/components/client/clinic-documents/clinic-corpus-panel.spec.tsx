import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardAiMessages } from '#lib/dashboard/localization';
import idAuthShellMessages from '../../../messages/id/auth-shell.json';
import idOperationsMessages from '../../../messages/id/operations.json';

const listDocumentsMock = vi.hoisted(() => vi.fn());
const approvalContextMock = vi.hoisted(() => vi.fn());
const submitForApprovalMock = vi.hoisted(() => vi.fn());
const eligibleApproversMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  documentAdminControllerListDocumentsV1: listDocumentsMock,
  documentAdminControllerCreateUploadUrlV1: vi.fn(),
  documentAdminControllerConfirmUploadV1: vi.fn(),
  documentAdminControllerUpdateDocumentV1: vi.fn(),
  documentAdminControllerDeleteDocumentV1: vi.fn(),
  documentAdminControllerGetDownloadUrlV1: vi.fn(),
  documentAdminControllerReingestDocumentV1: vi.fn(),
  documentAdminControllerSendDocumentForReviewV1: vi.fn(),
  documentAdminControllerGetApprovalContextV1: approvalContextMock,
  documentAdminControllerSubmitDocumentsForApprovalV1: submitForApprovalMock,
  getDocumentAdminControllerListDocumentsV1QueryKey: () => ['clinic-documents'],
  getDocumentAdminControllerGetApprovalContextV1QueryKey: () => ['clinic-corpus-approval-context'],
  documentAdminControllerGetPreviewV1: vi.fn(),
  getDocumentAdminControllerGetPreviewV1QueryKey: (id: string) => ['clinic-document-preview', id],
  getDocumentAdminControllerGetDownloadUrlV1QueryKey: (id: string) => ['clinic-document-file', id],
}));

vi.mock('#lib/api/generated/documents/documents', () => ({
  managedDocumentControllerListEligibleApproversV1: eligibleApproversMock,
  getManagedDocumentControllerListEligibleApproversV1QueryKey: (
    params: Record<string, unknown> = {},
  ) => ['eligible-approvers', params],
}));

const { ClinicCorpusPanel } = await import('./clinic-corpus-panel');

const CURRENT_USER_ID = 'user-1';
const APPROVER_ID = 'approver-1';

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
    uploadedById: CURRENT_USER_ID,
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

/** The reporter's state: the upload registered the row and left it at DRAFT. */
function buildDraftDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return buildDocument({
    approval: {
      isApprovalRequired: true,
      managedDocumentId: 'managed-1',
      status: 'DRAFT',
      pendingRound: null,
    },
    ...overrides,
  });
}

function renderPanel(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider
        locale="id"
        messages={{
          ...getDashboardAiMessages('id'),
          ...idAuthShellMessages,
          ...idOperationsMessages,
        }}
      >
        <ClinicCorpusPanel currentUserId={CURRENT_USER_ID} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const corpusMessages = getDashboardAiMessages('id').clinicCorpus;
const approvalMessages = corpusMessages.approval;
const submitMessages = approvalMessages.submit;

async function openSubmitDialog(): Promise<HTMLElement> {
  await screen.findByText('Jam Buka Poliklinik');
  await userEvent.click(screen.getByRole('button', { name: approvalMessages.sendForReview }));
  return screen.findByRole('dialog');
}

describe('ClinicCorpusPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDocumentsMock.mockResolvedValue({ status: 200, data: { data: [buildDocument()] } });
    approvalContextMock.mockResolvedValue({
      status: 200,
      data: {
        data: {
          isApprovalRequired: true,
          allowSelfApproval: false,
          requiredApprovals: 1,
          defaultApprovers: [{ id: APPROVER_ID, email: 'kepala.klinik@salingjaga.id' }],
        },
      },
    });
    eligibleApproversMock.mockResolvedValue({
      status: 200,
      data: {
        data: [{ id: APPROVER_ID, email: 'kepala.klinik@salingjaga.id', roleCodes: ['ADMIN'] }],
      },
    });
    submitForApprovalMock.mockResolvedValue({
      status: 200,
      data: { data: { submittedCount: 1, failedCount: 0, items: [] } },
    });
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
      'Pratinjau',
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

  it('offers the submit action on a draft, which is what an upload produces', async () => {
    // The reported dead end. The old control checked for the *absence* of a
    // registry row, so it hid itself on every document that actually needed
    // submitting — the badge said "Not submitted" and nothing could act on it.
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildDraftDocument()] },
    });
    renderPanel();
    await screen.findByText('Jam Buka Poliklinik');

    expect(
      screen.getByRole('button', { name: approvalMessages.sendForReview }),
    ).toBeInTheDocument();
  });

  it.each(['PENDING_APPROVAL', 'ISSUED', 'ARCHIVED'])(
    'hides the submit action on a %s document, where it could only be refused',
    async (status) => {
      listDocumentsMock.mockResolvedValue({
        status: 200,
        data: {
          data: [
            buildDocument({
              approval: {
                isApprovalRequired: true,
                managedDocumentId: 'managed-1',
                status,
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
    },
  );

  it('offers only accounts that can approve in the picker', async () => {
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildDraftDocument()] },
    });
    renderPanel();
    const dialog = await openSubmitDialog();

    // The source is the eligible-approver route, not the staff directory:
    // naming somebody who cannot decide produces a round nobody can resolve.
    await waitFor(() => expect(eligibleApproversMock).toHaveBeenCalled());
    expect(
      within(dialog).getByText(
        idOperationsMessages.operations.documents.approvals.picker.eligibleOnlyHint,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText('kepala.klinik@salingjaga.id').length).toBeGreaterThan(0);
  });

  it('opens with the type’s default approvers already chosen', async () => {
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildDraftDocument()] },
    });
    renderPanel();
    const dialog = await openSubmitDialog();

    // One click for the common case: the panel is prefilled, and Send is
    // enabled without the admin naming anybody.
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: submitMessages.submit })).toBeEnabled(),
    );
  });

  it('submits the row it was opened from, to the panel that was named', async () => {
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildDraftDocument()] },
    });
    renderPanel();
    const dialog = await openSubmitDialog();
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: submitMessages.submit })).toBeEnabled(),
    );

    await userEvent.click(within(dialog).getByRole('button', { name: submitMessages.submit }));

    await waitFor(() => expect(submitForApprovalMock).toHaveBeenCalledTimes(1));
    expect(submitForApprovalMock).toHaveBeenCalledWith({
      documentIds: ['doc-1'],
      approverIds: [APPROVER_ID],
    });
  });

  it('submits a whole selection in one call, not one call per row', async () => {
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: {
        data: [buildDraftDocument(), buildDraftDocument({ id: 'doc-2', title: 'SOP Rujukan' })],
      },
    });
    submitForApprovalMock.mockResolvedValue({
      status: 200,
      data: { data: { submittedCount: 2, failedCount: 0, items: [] } },
    });
    renderPanel();
    await screen.findByText('SOP Rujukan');

    await userEvent.click(screen.getByRole('checkbox', { name: corpusMessages.table.selectAll }));
    await userEvent.click(
      screen.getByRole('button', { name: /Kirim 2 dokumen untuk persetujuan/ }),
    );
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: submitMessages.submit })).toBeEnabled(),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: submitMessages.submit }));

    await waitFor(() => expect(submitForApprovalMock).toHaveBeenCalledTimes(1));
    expect(submitForApprovalMock).toHaveBeenCalledWith({
      documentIds: ['doc-1', 'doc-2'],
      approverIds: [APPROVER_ID],
    });
  });

  it('reports how many were refused and why, rather than claiming a clean run', async () => {
    // A batch is not a transaction. An admin told "2 sent" while one was
    // silently refused would find out from the approver, or never.
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: {
        data: [buildDraftDocument(), buildDraftDocument({ id: 'doc-2', title: 'SOP Rujukan' })],
      },
    });
    submitForApprovalMock.mockResolvedValue({
      status: 200,
      data: {
        data: {
          submittedCount: 1,
          failedCount: 1,
          items: [
            { documentId: 'doc-1', isSubmitted: true, error: null },
            {
              documentId: 'doc-2',
              isSubmitted: false,
              error: {
                code: 'DOCUMENT_NOT_SUBMITTABLE',
                message: 'This document is already waiting for approval',
              },
            },
          ],
        },
      },
    });
    renderPanel();
    await screen.findByText('SOP Rujukan');

    await userEvent.click(screen.getByRole('checkbox', { name: corpusMessages.table.selectAll }));
    await userEvent.click(
      screen.getByRole('button', { name: /Kirim 2 dokumen untuk persetujuan/ }),
    );
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: submitMessages.submit })).toBeEnabled(),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: submitMessages.submit }));

    expect(await screen.findByText(/1 dokumen terkirim/)).toBeInTheDocument();
    // The refusal's own sentence, because a count alone says nothing about
    // what to do next.
    expect(screen.getByText(/This document is already waiting for approval/)).toBeInTheDocument();
  });

  it('offers no checkbox on a document that cannot be submitted', async () => {
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

    // A box here would let an admin build a selection the batch can only
    // report back as failures.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});

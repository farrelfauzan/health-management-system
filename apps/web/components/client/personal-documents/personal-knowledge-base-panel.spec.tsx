import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardAiMessages } from '#lib/dashboard/localization';
import idAuthShellMessages from '../../../messages/id/auth-shell.json';
import idSharedMessages from '../../../messages/id/shared.json';

const listDocumentsMock = vi.hoisted(() => vi.fn());
const deleteDocumentMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  personalDocumentControllerListDocumentsV1: listDocumentsMock,
  personalDocumentControllerCreateUploadUrlV1: vi.fn(),
  personalDocumentControllerConfirmUploadV1: vi.fn(),
  personalDocumentControllerUpdateDocumentV1: vi.fn(),
  personalDocumentControllerDeleteDocumentV1: deleteDocumentMock,
  personalDocumentControllerGetDownloadUrlV1: vi.fn(),
  personalDocumentControllerReingestDocumentV1: vi.fn(),
  getPersonalDocumentControllerListDocumentsV1QueryKey: () => ['personal-documents'],
  personalDocumentControllerGetPreviewV1: vi.fn(),
  getPersonalDocumentControllerGetDownloadUrlV1QueryKey: (id: string) => [
    'personal-document-file',
    id,
  ],
  getPersonalDocumentControllerGetPreviewV1QueryKey: (id: string) => [
    'personal-document-preview',
    id,
  ],
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
      <NextIntlClientProvider
        locale="id"
        messages={{ ...getDashboardAiMessages('id'), ...idAuthShellMessages, ...idSharedMessages }}
      >
        <PersonalKnowledgeBasePanel />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** Mirrors `INGEST_POLL_INTERVAL_MS` in `use-personal-documents`. */
const POLL_INTERVAL_MS = 5_000;

const pagination = idSharedMessages.shared.pagination;

const deleteConfirm = getDashboardAiMessages('id').personalKnowledgeBase.actions.confirm.delete;

async function openDeleteDialog(): Promise<HTMLElement> {
  await screen.findByText('Panduan Tatalaksana Hipertensi');
  await userEvent.click(screen.getByRole('button', { name: 'Hapus' }));
  return screen.findByRole('dialog');
}

describe('PersonalKnowledgeBasePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDocumentsMock.mockResolvedValue({ status: 200, data: { data: [buildDocument()] } });
    deleteDocumentMock.mockResolvedValue({ status: 200, data: { data: { id: 'doc-1' } } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the no-patient-data notice on the list, not only in the dialog', async () => {
    renderPanel();

    expect(await screen.findByText(/Jangan simpan data pasien/i)).toBeInTheDocument();
  });

  // The row actions are icons now, so the glyph carries no text and the
  // accessible name is the only thing naming the button. If these queries
  // ever fail, the row has become four unlabelled buttons for a screen
  // reader, which is exactly the failure icon-only controls invite.
  it('names every row action even though the buttons are icon-only', async () => {
    renderPanel();

    for (const label of ['Unduh', 'Ubah nama', 'Proses ulang', 'Hapus']) {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
    }
    // No visible action text left to read, which is the point of the change.
    expect(screen.queryByText('Unduh')).not.toBeInTheDocument();
  });

  it('offers a preview on Markdown and PDF documents, and not on an image', async () => {
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: {
        data: [
          buildDocument({ id: 'doc-md', title: 'Catatan dosis anak', mimeType: 'text/markdown' }),
          buildDocument(),
          buildDocument({ id: 'doc-img', title: 'Foto ruam', mimeType: 'image/png' }),
        ],
      },
    });

    renderPanel();

    await screen.findByText('Foto ruam');
    expect(screen.getAllByRole('button', { name: 'Pratinjau' })).toHaveLength(2);
  });

  it('marks a READY document as answerable', async () => {
    renderPanel();

    expect(await screen.findByText('Siap')).toBeInTheDocument();
    expect(screen.queryByText(/belum bisa menjawab/i)).not.toBeInTheDocument();
  });

  it.each([
    ['PENDING', 'Menunggu diproses'],
    ['PROCESSING', 'Sedang diproses'],
  ])('says the assistant cannot answer yet while %s', async (ingestStatus, label) => {
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildDocument({ ingestStatus, chunkCount: 0 })] },
    });
    renderPanel();

    expect(await screen.findByText(label)).toBeInTheDocument();
    // The load-bearing claim: uploaded is not the same as retrievable, and a
    // clinician must not assume the assistant is already using this.
    expect(screen.getByText(/belum bisa menjawab/i)).toBeInTheDocument();
  });

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
    expect(screen.getByText(/the PDF has no extractable text layer/i)).toBeInTheDocument();
  });

  it('renders an empty state when nothing has been uploaded', async () => {
    listDocumentsMock.mockResolvedValue({ status: 200, data: { data: [] } });
    renderPanel();

    expect(await screen.findByText(/belum mengunggah dokumen/i)).toBeInTheDocument();
  });

  it('reaches the documents that fall past the first page', async () => {
    // The bug this covers: the endpoint has always answered with twenty rows
    // and a cursor, and the panel used to render the first answer and stop.
    // An owner with thirty-four documents saw the newest twenty and reported
    // it as uploads *replacing* what was already there.
    listDocumentsMock.mockImplementation(async (params?: { cursor?: string }) =>
      params?.cursor === 'doc-20'
        ? {
            status: 200,
            data: {
              data: [buildDocument({ id: 'doc-21', title: 'Panduan Tatalaksana Diabetes' })],
              meta: { nextCursor: null },
            },
          }
        : {
            status: 200,
            data: { data: [buildDocument()], meta: { nextCursor: 'doc-20' } },
          },
    );
    renderPanel();
    await screen.findByText('Panduan Tatalaksana Hipertensi');

    await userEvent.click(screen.getByRole('button', { name: pagination.nextPage }));

    expect(await screen.findByText('Panduan Tatalaksana Diabetes')).toBeInTheDocument();
    expect(screen.queryByText('Panduan Tatalaksana Hipertensi')).not.toBeInTheDocument();
    expect(listDocumentsMock).toHaveBeenLastCalledWith({ cursor: 'doc-20' }, expect.anything());
    // The API said there is nothing after this page, so there is nowhere left
    // to go — and the control says so rather than fetching an empty page.
    expect(screen.getByRole('button', { name: pagination.nextPage })).toBeDisabled();

    const callsBeforeGoingBack = listDocumentsMock.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: pagination.previousPage }));

    expect(await screen.findByText('Panduan Tatalaksana Hipertensi')).toBeInTheDocument();
    expect(listDocumentsMock.mock.calls.length).toBe(callsBeforeGoingBack);
  });

  it('offers no paging control while everything fits on one page', async () => {
    renderPanel();
    await screen.findByText('Panduan Tatalaksana Hipertensi');

    expect(screen.queryByRole('button', { name: pagination.nextPage })).not.toBeInTheDocument();
  });

  it('keeps polling while a document is still ingesting, and stops once it settles', async () => {
    // The paging rewrite moved this list onto an infinite query, so the poll
    // now reads a list of pages rather than a list of rows. If that predicate
    // ever stopped seeing the unsettled row, an owner would sit on
    // "processing" for a document the worker finished minutes ago.
    vi.useFakeTimers();
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildDocument({ ingestStatus: 'PROCESSING', chunkCount: 0 })] },
    });
    renderPanel();
    await vi.waitFor(() => expect(screen.getByText('Sedang diproses')).toBeInTheDocument());

    const callsWhileIngesting = listDocumentsMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(listDocumentsMock.mock.calls.length).toBeGreaterThan(callsWhileIngesting);

    listDocumentsMock.mockResolvedValue({ status: 200, data: { data: [buildDocument()] } });
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    await vi.waitFor(() => expect(screen.getByText('Siap')).toBeInTheDocument());

    const callsOnceSettled = listDocumentsMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    expect(listDocumentsMock.mock.calls.length).toBe(callsOnceSettled);
  });

  it('asks about a delete in the app, not through the browser\u2019s own confirm', async () => {
    // window.confirm is unstyled, unlocalised in its own buttons, says the
    // origin rather than the product above copy the reader is meant to trust,
    // and Chrome suppresses it after a few in a row — at which point a delete
    // goes unconfirmed.
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderPanel();

    const dialog = await openDeleteDialog();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(within(dialog).getByText(deleteConfirm.title)).toBeInTheDocument();
    // The copy names the document, and says the part an owner cannot guess:
    // the vectors go too, so re-uploading the same file is not enough.
    expect(within(dialog).getByText(/Panduan Tatalaksana Hipertensi/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Mengunggah ulang berkas yang sama tidak membatalkan/),
    ).toBeInTheDocument();
    // Reflex-pressing Enter must not delete anything.
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: deleteConfirm.cancel })).toHaveFocus(),
    );
  });

  it('deletes nothing when the owner backs out', async () => {
    renderPanel();
    const dialog = await openDeleteDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: deleteConfirm.cancel }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteDocumentMock).not.toHaveBeenCalled();
  });

  it('deletes nothing when the owner presses Escape', async () => {
    renderPanel();
    await openDeleteDialog();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteDocumentMock).not.toHaveBeenCalled();
  });

  it('calls the delete once when the owner confirms, and says so', async () => {
    renderPanel();
    const dialog = await openDeleteDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: deleteConfirm.confirm }));

    await waitFor(() => expect(deleteDocumentMock).toHaveBeenCalledTimes(1));
    expect(deleteDocumentMock).toHaveBeenCalledWith('doc-1');
    expect(
      await screen.findByText(
        getDashboardAiMessages('id').personalKnowledgeBase.actions.success.delete,
      ),
    ).toBeInTheDocument();
  });

  it('holds the dialog open and the confirm disabled while the delete is in flight', async () => {
    // Not cosmetic: a native confirm cannot show a pending state at all, so a
    // slow delete looked like nothing had happened and invited a second click.
    deleteDocumentMock.mockReturnValue(new Promise(() => {}));
    renderPanel();
    const dialog = await openDeleteDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: deleteConfirm.confirm }));

    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: deleteConfirm.confirm })).toBeDisabled(),
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(deleteDocumentMock).toHaveBeenCalledTimes(1);
  });
});

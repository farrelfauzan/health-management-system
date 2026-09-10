import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardAiMessages } from '#lib/dashboard/localization';
import enSharedMessages from '../../../messages/en/shared.json';

const uploadClinicDocumentMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/clinic-documents/upload-clinic-document', () => ({
  uploadClinicDocument: uploadClinicDocumentMock,
}));

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  documentAdminControllerCreateUploadUrlV1: vi.fn(),
  documentAdminControllerConfirmUploadV1: vi.fn(),
  documentAdminControllerListDocumentsV1: vi.fn(),
  getDocumentAdminControllerListDocumentsV1QueryKey: () => ['clinic-documents'],
}));

const { ClinicDocumentUploadDialog } = await import('./clinic-document-upload-dialog');

const MEBIBYTE = 1024 * 1024;

function buildFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function renderDialog(): { onUploaded: ReturnType<typeof vi.fn> } {
  const onUploaded = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <NextIntlClientProvider
      locale="en"
      messages={{ ...getDashboardAiMessages('en'), ...enSharedMessages }}
      timeZone="Asia/Jakarta"
    >
      <QueryClientProvider client={queryClient}>
        <ClinicDocumentUploadDialog open onOpenChange={vi.fn()} onUploaded={onUploaded} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { onUploaded };
}

describe('ClinicDocumentUploadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadClinicDocumentMock.mockResolvedValue(undefined);
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('uploads every picked file in one go, under its own filename', async () => {
    const user = userEvent.setup();
    const { onUploaded } = renderDialog();

    await user.upload(screen.getByLabelText('Files'), [
      buildFile('jam-buka-poliklinik.pdf', 'application/pdf', 4096),
      buildFile('sop-eskalasi.md', 'text/markdown', 2048),
      buildFile('alur-rujukan.pdf', 'application/pdf', 8192),
    ]);
    expect(await screen.findByText('3 files selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Upload 3 files' }));

    expect(uploadClinicDocumentMock).toHaveBeenCalledTimes(3);
    // Each document is recorded under its own filename; one title could not
    // have served three files.
    expect(uploadClinicDocumentMock.mock.calls.map(([params]) => params.title)).toEqual([
      'jam-buka-poliklinik.pdf',
      'sop-eskalasi.md',
      'alur-rujukan.pdf',
    ]);
    expect(onUploaded).toHaveBeenCalledWith('3 documents uploaded, none failed.');
  });

  it('applies the batch visibility and language, and the pinned FAQ purpose, to every file', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.upload(screen.getByLabelText('Files'), [
      buildFile('jam-buka-poliklinik.pdf', 'application/pdf', 4096),
      buildFile('alur-rujukan.pdf', 'application/pdf', 8192),
    ]);
    await user.click(screen.getByRole('button', { name: 'Upload 2 files' }));

    // Visibility is one control for the whole run, and it defaults to the
    // narrow audience: a forgotten field yields staff-only documents, never an
    // internal SOP quotable to a stranger on WhatsApp.
    expect(
      uploadClinicDocumentMock.mock.calls.every(
        ([params]) =>
          params.visibility === 'DOCTOR' &&
          params.language === 'ID' &&
          params.purpose === 'FAQ_KNOWLEDGE_BASE',
      ),
    ).toBe(true);
  });

  it('records the files that succeed when another in the batch fails', async () => {
    uploadClinicDocumentMock.mockImplementation(async ({ title }: { title: string }) => {
      if (title === 'rusak.pdf') {
        throw new Error('content check failed');
      }
    });
    const user = userEvent.setup();
    const { onUploaded } = renderDialog();

    await user.upload(screen.getByLabelText('Files'), [
      buildFile('jam-buka-poliklinik.pdf', 'application/pdf', 4096),
      buildFile('rusak.pdf', 'application/pdf', 4096),
      buildFile('alur-rujukan.pdf', 'application/pdf', 8192),
    ]);
    await user.click(screen.getByRole('button', { name: 'Upload 3 files' }));

    // The failure in the middle stops neither the third file nor the first.
    expect(await screen.findAllByText('Uploaded')).toHaveLength(2);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(uploadClinicDocumentMock).toHaveBeenCalledTimes(3);
    expect(onUploaded).toHaveBeenCalledWith('2 documents uploaded, 1 failed.');
    // The failed row stays in the list, and it is the only one left to send.
    expect(screen.getByRole('button', { name: 'Upload 1 file' })).toBeInTheDocument();
  });

  it('retries only the failed row when upload is pressed again', async () => {
    uploadClinicDocumentMock.mockImplementationOnce(async () => undefined);
    uploadClinicDocumentMock.mockImplementationOnce(async () => {
      throw new Error('storage refused the file');
    });
    const user = userEvent.setup();
    const { onUploaded } = renderDialog();

    await user.upload(screen.getByLabelText('Files'), [
      buildFile('jam-buka-poliklinik.pdf', 'application/pdf', 4096),
      buildFile('rusak.pdf', 'application/pdf', 4096),
    ]);
    await user.click(screen.getByRole('button', { name: 'Upload 2 files' }));
    expect(await screen.findByText('Failed')).toBeInTheDocument();

    uploadClinicDocumentMock.mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Upload 1 file' }));

    // Two attempts for the batch plus one for the retry: the file that was
    // already recorded is not sent a second time.
    expect(uploadClinicDocumentMock).toHaveBeenCalledTimes(3);
    expect(uploadClinicDocumentMock.mock.calls[2]?.[0].title).toBe('rusak.pdf');
    expect(onUploaded).toHaveBeenLastCalledWith('1 document uploaded, none failed.');
    // Nothing is left to retry, so the dialog clears itself and closes.
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
  });

  it('keeps the accepted files from a mixed pick and names the rejected one', async () => {
    renderDialog();

    await userEvent
      .setup()
      .upload(screen.getByLabelText('Files'), [
        buildFile('jam-buka-poliklinik.pdf', 'application/pdf', 4096),
        buildFile('atlas.pdf', 'application/pdf', 25 * MEBIBYTE),
      ]);

    expect(await screen.findByText('1 file selected')).toBeInTheDocument();
    expect(screen.getByText('atlas.pdf is larger than the 20 MB limit.')).toBeInTheDocument();
    expect(uploadClinicDocumentMock).not.toHaveBeenCalled();
  });

  it('does not offer a title field, per row or for the batch', async () => {
    renderDialog();

    await userEvent
      .setup()
      .upload(
        screen.getByLabelText('Files'),
        buildFile('jam-buka-poliklinik.pdf', 'application/pdf', 4096),
      );

    expect(await screen.findByText('1 file selected')).toBeInTheDocument();
    // Twenty rows of text inputs would make the bulk case worse to spare the
    // rare bad filename, and one title for twenty files was never right;
    // renaming afterwards from the edit dialog handles both.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

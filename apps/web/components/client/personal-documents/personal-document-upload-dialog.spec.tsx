import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardAiMessages } from '#lib/dashboard/localization';
import enSharedMessages from '../../../messages/en/shared.json';

const uploadPersonalDocumentMock = vi.hoisted(() => vi.fn());
const createUploadUrlMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/personal-documents/upload-personal-document', () => ({
  uploadPersonalDocument: uploadPersonalDocumentMock,
}));

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  personalDocumentControllerCreateUploadUrlV1: createUploadUrlMock,
  personalDocumentControllerConfirmUploadV1: vi.fn(),
  personalDocumentControllerListDocumentsV1: vi.fn(),
  getPersonalDocumentControllerListDocumentsV1QueryKey: () => ['personal-documents'],
}));

const { PersonalDocumentUploadDialog } = await import('./personal-document-upload-dialog');

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
        <PersonalDocumentUploadDialog open onOpenChange={vi.fn()} onUploaded={onUploaded} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { onUploaded };
}

describe('PersonalDocumentUploadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadPersonalDocumentMock.mockResolvedValue(undefined);
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('keeps the no-patient-data warning above the picker', async () => {
    renderDialog();

    const notice = await screen.findByText(/No patient data in your knowledge base/i);
    const picker = screen.getByLabelText('Files');
    // `compareDocumentPosition` rather than a snapshot: the only property that
    // matters is that the warning is read before a file is chosen.
    expect(notice.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('uploads every picked file in one go, with the batch language', async () => {
    const user = userEvent.setup();
    const { onUploaded } = renderDialog();

    await user.upload(screen.getByLabelText('Files'), [
      buildFile('panduan-hipertensi.pdf', 'application/pdf', 4096),
      buildFile('formularium.md', 'text/markdown', 2048),
      buildFile('alur-rujukan.pdf', 'application/pdf', 8192),
    ]);
    expect(await screen.findByText('3 files selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Upload 3 files' }));

    expect(uploadPersonalDocumentMock).toHaveBeenCalledTimes(3);
    // Each document is recorded under its own filename; one title could not
    // have served three files.
    expect(uploadPersonalDocumentMock.mock.calls.map(([params]) => params.title)).toEqual([
      'panduan-hipertensi.pdf',
      'formularium.md',
      'alur-rujukan.pdf',
    ]);
    expect(
      uploadPersonalDocumentMock.mock.calls.every(([params]) => params.language === 'ID'),
    ).toBe(true);
    expect(onUploaded).toHaveBeenCalledWith('3 documents uploaded, none failed.');
  });

  it('records the files that succeed when another in the batch fails', async () => {
    uploadPersonalDocumentMock.mockImplementation(async ({ title }: { title: string }) => {
      if (title === 'rusak.pdf') {
        throw new Error('content check failed');
      }
    });
    const user = userEvent.setup();
    const { onUploaded } = renderDialog();

    await user.upload(screen.getByLabelText('Files'), [
      buildFile('panduan-hipertensi.pdf', 'application/pdf', 4096),
      buildFile('rusak.pdf', 'application/pdf', 4096),
      buildFile('alur-rujukan.pdf', 'application/pdf', 8192),
    ]);
    await user.click(screen.getByRole('button', { name: 'Upload 3 files' }));

    // The failure in the middle stops neither the third file nor the first.
    expect(await screen.findAllByText('Uploaded')).toHaveLength(2);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(uploadPersonalDocumentMock).toHaveBeenCalledTimes(3);
    expect(onUploaded).toHaveBeenCalledWith('2 documents uploaded, 1 failed.');
    // The failed row stays in the list, and it is the only one left to send.
    expect(screen.getByRole('button', { name: 'Upload 1 file' })).toBeInTheDocument();
  });

  it('retries only the failed row when upload is pressed again', async () => {
    uploadPersonalDocumentMock.mockImplementationOnce(async () => undefined);
    uploadPersonalDocumentMock.mockImplementationOnce(async () => {
      throw new Error('storage refused the file');
    });
    const user = userEvent.setup();
    const { onUploaded } = renderDialog();

    await user.upload(screen.getByLabelText('Files'), [
      buildFile('panduan-hipertensi.pdf', 'application/pdf', 4096),
      buildFile('rusak.pdf', 'application/pdf', 4096),
    ]);
    await user.click(screen.getByRole('button', { name: 'Upload 2 files' }));
    expect(await screen.findByText('Failed')).toBeInTheDocument();

    uploadPersonalDocumentMock.mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Upload 1 file' }));

    // Two attempts for the batch plus one for the retry: the file that was
    // already recorded is not sent a second time.
    expect(uploadPersonalDocumentMock).toHaveBeenCalledTimes(3);
    expect(uploadPersonalDocumentMock.mock.calls[2]?.[0].title).toBe('rusak.pdf');
    expect(onUploaded).toHaveBeenLastCalledWith('1 document uploaded, none failed.');
    // Nothing is left to retry, so the dialog clears itself and closes.
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
  });

  it('keeps the accepted files from a mixed pick and names the rejected one', async () => {
    renderDialog();

    await userEvent
      .setup()
      .upload(screen.getByLabelText('Files'), [
        buildFile('panduan-hipertensi.pdf', 'application/pdf', 4096),
        buildFile('atlas.pdf', 'application/pdf', 25 * MEBIBYTE),
      ]);

    expect(await screen.findByText('1 file selected')).toBeInTheDocument();
    // Not `getByRole('alert')`: the standing no-patient-data warning is one
    // too, and this assertion is about the rejection.
    expect(screen.getByText('atlas.pdf is larger than the 20 MB limit.')).toBeInTheDocument();
    expect(uploadPersonalDocumentMock).not.toHaveBeenCalled();
  });

  it('does not offer a title field per row', async () => {
    renderDialog();

    await userEvent
      .setup()
      .upload(
        screen.getByLabelText('Files'),
        buildFile('panduan-hipertensi.pdf', 'application/pdf', 4096),
      );

    expect(await screen.findByText('1 file selected')).toBeInTheDocument();
    // Twenty rows of text inputs would make the bulk case worse to spare the
    // rare bad filename; renaming afterwards handles that one.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

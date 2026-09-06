import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TemplateImportButton } from './template-import-button';
import {
  documentTemplateControllerCreateImportUploadUrlV1,
  documentTemplateControllerImportTemplateV1,
} from '#lib/api/generated/document-templates/document-templates';
import { putFileToSignedUrl } from '#lib/documents/put-file-to-signed-url';
import messages from '../../../messages/en/operations.json';

vi.mock('#lib/api/generated/document-templates/document-templates', () => ({
  documentTemplateControllerCreateImportUploadUrlV1: vi.fn(),
  documentTemplateControllerImportTemplateV1: vi.fn(),
}));

vi.mock('#lib/documents/put-file-to-signed-url', () => ({
  putFileToSignedUrl: vi.fn().mockResolvedValue(undefined),
}));

const signMock = vi.mocked(documentTemplateControllerCreateImportUploadUrlV1);
const importMock = vi.mocked(documentTemplateControllerImportTemplateV1);
const putMock = vi.mocked(putFileToSignedUrl);

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const STAGED_KEY = 'document-templates/imports/staged/5d0e8442-1d1a-4f9c-beb3-6fb6cfd2cf21.docx';

function renderButton() {
  const onImported = vi.fn();
  const onError = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" timeZone="Asia/Jakarta" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <TemplateImportButton
          templateId="template-1"
          isDisabled={false}
          onImported={onImported}
          onError={onError}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { onImported, onError };
}

describe('TemplateImportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: {
          url: 'https://storage.example/put',
          storageKey: STAGED_KEY,
          expiresAt: '2026-09-05T13:05:00.000Z',
          requiredHeaders: { 'Content-Type': DOCX_MIME },
        },
      },
    } as never);
    importMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: {
          contentHtml: '<h1><span data-hms-var="clinic.name"></span></h1>',
          warnings: [{ code: 'UNKNOWN_PLACEHOLDER', message: 'x', detail: 'tanda.tangan' }],
        },
      },
    } as never);
  });

  it('stages the file, converts it, and hands the draft to the editor', async () => {
    const user = userEvent.setup();
    const { onImported, onError } = renderButton();
    const file = new File(['PK'], 'kuitansi.docx', { type: DOCX_MIME });

    await user.upload(screen.getByLabelText('Import from Word'), file);

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(signMock).toHaveBeenCalledWith({ sizeBytes: file.size });
    expect(putMock).toHaveBeenCalledWith('https://storage.example/put', file, {
      'Content-Type': DOCX_MIME,
    });
    expect(importMock).toHaveBeenCalledWith('template-1', { stagedKey: STAGED_KEY });
    expect(onImported).toHaveBeenCalledWith(
      expect.objectContaining({ contentHtml: expect.stringContaining('clinic.name') }),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a Word document before uploading anything', async () => {
    const { onImported, onError } = renderButton();
    const file = new File(['%PDF-'], 'kuitansi.pdf', { type: 'application/pdf' });

    // Fired directly: the picker's `accept` would keep a PDF out in a real
    // browser, and user-event honours it, but the guard must hold on its own.
    fireEvent.change(screen.getByLabelText('Import from Word'), { target: { files: [file] } });

    expect(onError).toHaveBeenCalledWith('Pick a Word file (.docx).');
    expect(signMock).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('refuses a file over the size cap before uploading anything', async () => {
    const user = userEvent.setup();
    const { onError } = renderButton();
    const file = new File([new Uint8Array(1)], 'besar.docx', { type: DOCX_MIME });
    Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 });

    await user.upload(screen.getByLabelText('Import from Word'), file);

    expect(onError).toHaveBeenCalledWith('The file is larger than 5 MB.');
    expect(signMock).not.toHaveBeenCalled();
  });

  it('reports a conversion failure through the error callback', async () => {
    const user = userEvent.setup();
    importMock.mockRejectedValue(new Error('boom'));
    const { onImported, onError } = renderButton();

    await user.upload(
      screen.getByLabelText('Import from Word'),
      new File(['PK'], 'kuitansi.docx', { type: DOCX_MIME }),
    );

    await waitFor(() => expect(onError).toHaveBeenCalledWith('boom'));
    expect(onImported).not.toHaveBeenCalled();
  });
});

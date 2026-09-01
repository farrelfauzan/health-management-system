import { DOCUMENT_MAX_UPLOAD_SIZE_BYTES } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { DocumentFilePicker } from './document-file-picker';
import messages from '../../../messages/en/shared.json';

function buildFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type });
  // `File` has no writable size, and a 25 MiB fixture would be 25 MiB of
  // heap for a check that only reads the number.
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function renderPicker(handlers: {
  onFileSelected: (file: File | null) => void;
  onRejected: (message: string) => void;
}): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <DocumentFilePicker
        id="document-file"
        label="File"
        hint="PDF, Markdown, plain text, or an image."
        {...handlers}
      />
    </NextIntlClientProvider>,
  );
}

describe('DocumentFilePicker', () => {
  it.each([
    ['a PDF', 'rujukan.pdf', 'application/pdf'],
    ['a scanned JPEG', 'rujukan.jpg', 'image/jpeg'],
    ['a PNG', 'hasil-lab.png', 'image/png'],
    ['a WebP', 'foto.webp', 'image/webp'],
  ])('accepts %s', async (_label, name, type) => {
    const onFileSelected = vi.fn();
    const onRejected = vi.fn();
    renderPicker({ onFileSelected, onRejected });

    await userEvent.setup().upload(screen.getByLabelText('File'), buildFile(name, type, 2048));

    expect(onFileSelected).toHaveBeenCalledWith(expect.objectContaining({ name }));
    expect(onRejected).not.toHaveBeenCalled();
  });

  it('refuses a type the document store does not accept, reporting no file', async () => {
    // `applyAccept: false` on purpose: the input's `accept` attribute is a
    // picker hint, and an OS dialog set to "All files" walks straight past it.
    const onFileSelected = vi.fn();
    const onRejected = vi.fn();
    renderPicker({ onFileSelected, onRejected });

    await userEvent
      .setup({ applyAccept: false })
      .upload(screen.getByLabelText('File'), buildFile('archive.zip', 'application/zip', 2048));

    expect(onFileSelected).toHaveBeenCalledWith(null);
    expect(onRejected).toHaveBeenCalledWith(expect.stringContaining('not accepted'));
  });

  it('refuses an oversize file and names the limit, before any upload is requested', async () => {
    const onFileSelected = vi.fn();
    const onRejected = vi.fn();
    renderPicker({ onFileSelected, onRejected });

    await userEvent
      .setup()
      .upload(
        screen.getByLabelText('File'),
        buildFile('radiologi.pdf', 'application/pdf', 25 * 1024 * 1024),
      );

    expect(onFileSelected).toHaveBeenCalledWith(null);
    // The person who chose the file is told the limit rather than watching a
    // signed upload fail against it.
    expect(onRejected).toHaveBeenCalledWith('That file is larger than the 20 MB limit.');
  });

  it('accepts a file exactly at the limit', async () => {
    const onFileSelected = vi.fn();
    const onRejected = vi.fn();
    renderPicker({ onFileSelected, onRejected });

    await userEvent
      .setup()
      .upload(
        screen.getByLabelText('File'),
        buildFile('radiologi.pdf', 'application/pdf', DOCUMENT_MAX_UPLOAD_SIZE_BYTES),
      );

    expect(onRejected).not.toHaveBeenCalled();
    expect(onFileSelected).toHaveBeenCalledWith(expect.objectContaining({ name: 'radiologi.pdf' }));
  });
});

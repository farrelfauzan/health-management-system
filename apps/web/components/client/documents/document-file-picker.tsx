'use client';

import { DOCUMENT_MAX_UPLOAD_SIZE_BYTES, DOCUMENT_UPLOAD_MIME_TYPES } from '@hms/shared-types';
import { Input, Label } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { isAcceptedDocumentMimeType } from '#lib/documents/is-accepted-document-mime-type';

type DocumentFilePickerProps = {
  id: string;
  label: string;
  hint: string;
  disabled?: boolean;
  onFileSelected: (file: File | null) => void;
  onRejected: (message: string) => void;
};

const BYTES_PER_MEBIBYTE = 1024 * 1024;

/**
 * The one place the document store's upload rules are enforced in the browser
 * (`P16-T03`).
 *
 * Both upload flows mount this rather than their own `<input type="file">`,
 * so the accepted types and the size cap are stated once. The check happens
 * **before a signed URL is requested**: a 25 MiB file that reached the API
 * would be refused there anyway, but only after a round trip, and the person
 * who chose it deserves to be told the limit rather than watch an upload
 * fail.
 *
 * This is convenience, not security. `accept` is a picker hint and
 * `File.type` is whatever the OS guessed — the controls that matter are the
 * declared type and length signed into the upload URL, and the magic-byte
 * check plus re-encode the API runs on the bytes themselves at confirm.
 */
export function DocumentFilePicker({
  id,
  label,
  hint,
  disabled = false,
  onFileSelected,
  onRejected,
}: DocumentFilePickerProps) {
  const t = useTranslations('shared.documentUpload');

  function handleFile(file: File | null): void {
    if (file === null) {
      onFileSelected(null);
      return;
    }
    if (!isAcceptedDocumentMimeType(file.type)) {
      onFileSelected(null);
      onRejected(t('errors.unsupportedType'));
      return;
    }
    if (file.size > DOCUMENT_MAX_UPLOAD_SIZE_BYTES) {
      onFileSelected(null);
      onRejected(
        t('errors.tooLarge', { limitMb: DOCUMENT_MAX_UPLOAD_SIZE_BYTES / BYTES_PER_MEBIBYTE }),
      );
      return;
    }
    onFileSelected(file);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="file"
        disabled={disabled}
        accept={DOCUMENT_UPLOAD_MIME_TYPES.join(',')}
        onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
      />
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}

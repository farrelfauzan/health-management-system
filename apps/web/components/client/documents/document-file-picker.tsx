'use client';

import type { ChangeEvent } from 'react';
import {
  DOCUMENT_MAX_UPLOAD_SIZE_BYTES,
  DOCUMENT_UPLOAD_MIME_TYPES,
  type DocumentUploadMimeTypeValue,
} from '@hms/shared-types';
import { Input, Label } from '@hms/ui';
import { useTranslations } from 'next-intl';

type DocumentFilePickerProps = {
  id: string;
  label: string;
  hint: string;
  disabled?: boolean;
  /**
   * A surface may narrow the store's allowlist, never widen it: the default
   * is every type the store accepts, and the patient-documents tab passes the
   * four a clinical scan can be.
   */
  accept?: readonly DocumentUploadMimeTypeValue[];
  /** Pick several at once; rejections are then reported per file, by name. */
  multiple?: boolean;
  onFileSelected?: (file: File | null) => void;
  onFilesSelected?: (files: File[]) => void;
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
  accept = DOCUMENT_UPLOAD_MIME_TYPES,
  multiple = false,
  onFileSelected,
  onFilesSelected,
  onRejected,
}: DocumentFilePickerProps) {
  const t = useTranslations('shared.documentUpload');
  const limitMb = DOCUMENT_MAX_UPLOAD_SIZE_BYTES / BYTES_PER_MEBIBYTE;

  function resolveRejection(file: File): string | null {
    const isAcceptedType = accept.some((mimeType) => mimeType === file.type);
    if (!isAcceptedType) {
      return multiple
        ? t('errors.unsupportedTypeNamed', { name: file.name })
        : t('errors.unsupportedType');
    }
    if (file.size > DOCUMENT_MAX_UPLOAD_SIZE_BYTES) {
      return multiple
        ? t('errors.tooLargeNamed', { name: file.name, limitMb })
        : t('errors.tooLarge', { limitMb });
    }
    return null;
  }

  function handleFile(file: File | null): void {
    if (file === null) {
      onFileSelected?.(null);
      return;
    }
    const rejection = resolveRejection(file);
    if (rejection !== null) {
      onFileSelected?.(null);
      onRejected(rejection);
      return;
    }
    onFileSelected?.(file);
  }

  function handleFiles(files: File[]): void {
    // Each file is judged on its own: one oversize scan among four must not
    // throw the other three away, and each rejection names the file so the
    // person knows which one to leave out.
    const accepted: File[] = [];
    for (const file of files) {
      const rejection = resolveRejection(file);
      if (rejection === null) {
        accepted.push(file);
      } else {
        onRejected(rejection);
      }
    }
    onFilesSelected?.(accepted);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    if (multiple) {
      handleFiles(files);
      // Cleared so picking the same file again after removing it from the
      // batch fires a change event; a native input ignores a repeat pick.
      event.target.value = '';
      return;
    }
    handleFile(files[0] ?? null);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="file"
        disabled={disabled}
        multiple={multiple}
        accept={accept.join(',')}
        onChange={handleChange}
      />
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}

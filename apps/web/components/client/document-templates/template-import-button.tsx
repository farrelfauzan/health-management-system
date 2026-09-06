'use client';

import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  DOCUMENT_TEMPLATE_IMPORT_MAX_UPLOAD_SIZE_BYTES,
  DOCUMENT_TEMPLATE_IMPORT_MIME_TYPE,
  type DocumentTemplateImportView,
} from '@hms/shared-types';
import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { importDocumentTemplate } from '#lib/document-templates/import-document-template';
import { isDocxFile } from '#lib/document-templates/is-docx-file';

type TemplateImportButtonProps = {
  templateId: string;
  isDisabled: boolean;
  onImported: (view: DocumentTemplateImportView) => void;
  onError: (message: string) => void;
};

/**
 * *Import from Word* (P16-T42): pick a `.docx`, refuse the obviously wrong
 * file before uploading, stage it, convert it, and hand the draft back to
 * the editor. Nothing is saved here — the editor shows the result as
 * unsaved, and Save is the author's decision.
 */
export function TemplateImportButton({
  templateId,
  isDisabled,
  onImported,
  onError,
}: TemplateImportButtonProps) {
  const t = useTranslations('operations.billing.templates.import');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importMutation = useMutation({
    mutationFn: (file: File) =>
      importDocumentTemplate({
        templateId,
        file,
        uploadErrorMessage: t('uploadError'),
        importErrorMessage: t('error'),
      }),
    onSuccess: (view) => onImported(view),
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('error'))),
  });

  function handleFileSelected(file: File): void {
    if (!isDocxFile(file)) {
      onError(t('unsupportedType'));
      return;
    }
    if (file.size > DOCUMENT_TEMPLATE_IMPORT_MAX_UPLOAD_SIZE_BYTES) {
      onError(t('tooLarge'));
      return;
    }
    importMutation.mutate(file);
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isDisabled || importMutation.isPending}
        onClick={() => fileInputRef.current?.click()}
      >
        <Icon name="upload_file" size={18} />
        {importMutation.isPending ? t('importing') : t('action')}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept={`.docx,${DOCUMENT_TEMPLATE_IMPORT_MIME_TYPE}`}
        className="hidden"
        aria-label={t('action')}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            handleFileSelected(file);
          }
          // Cleared so picking the same file again still fires a change event.
          event.target.value = '';
        }}
      />
    </>
  );
}

'use client';

import type { DocumentContentModeValue } from '@hms/shared-types';
import { Button, Icon, Label, RichTextEditor } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DocumentFilePicker } from '#components/client/documents/document-file-picker';
import { UploadProgressIndicator } from '#components/client/documents/upload-progress-indicator';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';
import type { ManagedDocumentContentChoice } from '#lib/managed-documents/resolve-content-choice';
import { resolveContentChoice } from '#lib/managed-documents/resolve-content-choice';
import { formatDocumentSize } from '#lib/patient-documents/format-document-size';

type ManagedDocumentContentFieldsProps = {
  contentMode: DocumentContentModeValue | null;
  choice: ManagedDocumentContentChoice;
  contentHtml: string;
  file: File | null;
  progress: DocumentUploadProgress | null;
  disabled: boolean;
  onChoiceChange: (choice: ManagedDocumentContentChoice) => void;
  onContentHtmlChange: (contentHtml: string) => void;
  onFileChange: (file: File | null) => void;
  onFileRejected: (message: string) => void;
};

/**
 * The body control, driven by the type's content mode (FR-E5-35): the
 * editor for DRAFTED, the file picker for UPLOADED, and an explicit
 * "write it / upload a signed copy" choice for EITHER — a clinic wants both
 * a template it fills in and a scan of the signed copy (RQ-4), and the
 * choice is the drafter's, never both.
 */
export function ManagedDocumentContentFields({
  contentMode,
  choice,
  contentHtml,
  file,
  progress,
  disabled,
  onChoiceChange,
  onContentHtmlChange,
  onFileChange,
  onFileRejected,
}: ManagedDocumentContentFieldsProps) {
  const t = useTranslations('operations.documents.form');
  const resolved = resolveContentChoice(contentMode, choice);

  if (resolved === null) {
    return null;
  }

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-medium text-slate-900">{t('content.label')}</legend>
      {contentMode === 'EITHER' ? (
        <div className="flex gap-2" role="radiogroup" aria-label={t('content.choice')}>
          <Button
            type="button"
            size="sm"
            variant={resolved === 'draft' ? 'default' : 'outline'}
            role="radio"
            aria-checked={resolved === 'draft'}
            onClick={() => onChoiceChange('draft')}
          >
            <Icon name="edit_note" size={16} />
            {t('content.draft')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={resolved === 'upload' ? 'default' : 'outline'}
            role="radio"
            aria-checked={resolved === 'upload'}
            onClick={() => onChoiceChange('upload')}
          >
            <Icon name="upload_file" size={16} />
            {t('content.upload')}
          </Button>
        </div>
      ) : null}
      {resolved === 'draft' ? (
        <div className="space-y-1">
          <RichTextEditor
            id="managed-document-content"
            aria-label={t('content.label')}
            value={contentHtml}
            disabled={disabled}
            onValueChange={onContentHtmlChange}
          />
          <p className="text-xs text-slate-500">{t('content.editorHint')}</p>
        </div>
      ) : file === null ? (
        <DocumentFilePicker
          id="managed-document-file"
          label={t('content.fileLabel')}
          hint={t('content.fileHint')}
          disabled={disabled}
          onFileSelected={onFileChange}
          onRejected={onFileRejected}
        />
      ) : (
        <div className="space-y-2 rounded-lg border border-slate-200 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm text-slate-700">
              {t('content.fileSelected', { name: file.name, size: formatDocumentSize(file.size) })}
            </p>
            {progress === null ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('content.removeFile')}
                onClick={() => onFileChange(null)}
              >
                <Icon name="close" size={16} />
              </Button>
            ) : null}
          </div>
          {progress !== null ? (
            <UploadProgressIndicator
              progress={progress}
              label={
                progress.stage === 'uploading'
                  ? t('progress.uploading', { percent: progress.percent })
                  : t(`progress.${progress.stage}`)
              }
            />
          ) : null}
        </div>
      )}
      <Label htmlFor="managed-document-content" className="sr-only">
        {t('content.label')}
      </Label>
    </fieldset>
  );
}

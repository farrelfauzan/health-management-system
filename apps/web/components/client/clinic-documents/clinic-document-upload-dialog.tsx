'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DOCUMENT_LANGUAGES,
  DOCUMENT_UPLOAD_MIME_TYPES,
  DOCUMENT_VISIBILITIES,
  type DocumentLanguageValue,
  type DocumentUploadMimeTypeValue,
  type DocumentVisibilityValue,
} from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { UploadProgressIndicator } from '#components/client/documents/upload-progress-indicator';
import { invalidateClinicDocumentQueries } from '#lib/clinic-documents/invalidate-clinic-document-queries';
import { uploadClinicDocument } from '#lib/clinic-documents/upload-clinic-document';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';

type ClinicDocumentUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (message: string) => void;
};

function isAcceptedMimeType(value: string): value is DocumentUploadMimeTypeValue {
  return DOCUMENT_UPLOAD_MIME_TYPES.some((mimeType) => mimeType === value);
}

/**
 * The upload flow for the shared corpus.
 *
 * **Visibility defaults to `DOCTOR`, not `BOTH`.** The safe default is the
 * narrow one: an admin who forgets the field gets a staff-only document, which
 * is a document that answers too few questions, rather than a patient-facing
 * one, which is an internal SOP quoted to a stranger on WhatsApp. Only one of
 * those two mistakes is recoverable by editing the row afterwards.
 */
export function ClinicDocumentUploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: ClinicDocumentUploadDialogProps) {
  const t = useTranslations('clinicCorpus.upload');
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<DocumentVisibilityValue>('DOCTOR');
  const [language, setLanguage] = useState<DocumentLanguageValue>('ID');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<DocumentUploadProgress | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error(t('errors.noFile'));
      }
      if (!isAcceptedMimeType(file.type)) {
        throw new Error(t('errors.unsupportedType'));
      }
      await uploadClinicDocument({
        file,
        title: title.trim() === '' ? file.name : title.trim(),
        mimeType: file.type,
        // Pinned rather than offered. This screen is the FAQ corpus; a
        // GENERAL document would be stored and never embedded, which on a
        // knowledge-base screen is a silently useless upload.
        purpose: 'FAQ_KNOWLEDGE_BASE',
        visibility,
        language,
        onProgress: setProgress,
      });
    },
    onSuccess: async () => {
      await invalidateClinicDocumentQueries(queryClient);
      resetForm();
      onOpenChange(false);
      onUploaded(t('success'));
    },
    onError: (err: unknown) => {
      setProgress(null);
      setError(resolveApiErrorMessage(err, t('errors.failed')));
    },
  });

  function resetForm(): void {
    setFile(null);
    setTitle('');
    setVisibility('DOCTOR');
    setLanguage('ID');
    setError(null);
    setProgress(null);
  }

  function resolveProgressLabel(current: DocumentUploadProgress): string {
    if (current.stage === 'uploading') {
      return t('progress.uploading', { percent: current.percent });
    }
    return t(`progress.${current.stage}`);
  }

  function handleOpenChange(nextOpen: boolean): void {
    // Closing mid-upload would hide a request that is still running; the
    // dialog stays open until the upload settles either way.
    if (!nextOpen && uploadMutation.isPending) {
      return;
    }
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clinic-document-file">{t('fields.file')}</Label>
            <Input
              id="clinic-document-file"
              type="file"
              accept={DOCUMENT_UPLOAD_MIME_TYPES.join(',')}
              onChange={(event) => {
                setError(null);
                setFile(event.target.files?.[0] ?? null);
              }}
            />
            <p className="text-xs text-slate-500">{t('fields.fileHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="clinic-document-title">{t('fields.title')}</Label>
            <Input
              id="clinic-document-title"
              value={title}
              placeholder={file?.name ?? ''}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clinic-document-visibility">{t('fields.visibility')}</Label>
            <Select
              value={visibility}
              onValueChange={(value) => setVisibility(value as DocumentVisibilityValue)}
            >
              <SelectTrigger id="clinic-document-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_VISIBILITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`visibilities.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">{t('fields.visibilityHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="clinic-document-language">{t('fields.language')}</Label>
            <Select
              value={language}
              onValueChange={(value) => setLanguage(value as DocumentLanguageValue)}
            >
              <SelectTrigger id="clinic-document-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_LANGUAGES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`languages.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {progress && uploadMutation.isPending ? (
            <UploadProgressIndicator progress={progress} label={resolveProgressLabel(progress)} />
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={uploadMutation.isPending}
            onClick={() => handleOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!file || uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
          >
            {uploadMutation.isPending ? t('actions.uploading') : t('actions.upload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

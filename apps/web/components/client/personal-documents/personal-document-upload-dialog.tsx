'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DOCUMENT_LANGUAGES, type DocumentLanguageValue } from '@hms/shared-types';
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

import { DocumentFilePicker } from '#components/client/documents/document-file-picker';
import { UploadProgressIndicator } from '#components/client/documents/upload-progress-indicator';
import { NoPatientDataNotice } from '#components/client/personal-documents/no-patient-data-notice';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { isAcceptedDocumentMimeType } from '#lib/documents/is-accepted-document-mime-type';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';
import { invalidatePersonalDocumentQueries } from '#lib/personal-documents/invalidate-personal-document-queries';
import { uploadPersonalDocument } from '#lib/personal-documents/upload-personal-document';

type PersonalDocumentUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (message: string) => void;
};

/**
 * The upload flow, and the only place the no-patient-data notice can do its
 * job. It sits above the file picker rather than below the submit button:
 * the warning has to be read before a file is chosen, not acknowledged after.
 */
export function PersonalDocumentUploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: PersonalDocumentUploadDialogProps) {
  const t = useTranslations('personalKnowledgeBase.upload');
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<DocumentLanguageValue>('ID');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<DocumentUploadProgress | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error(t('errors.noFile'));
      }
      if (!isAcceptedDocumentMimeType(file.type)) {
        throw new Error(t('errors.unsupportedType'));
      }
      await uploadPersonalDocument({
        file,
        title: title.trim() === '' ? file.name : title.trim(),
        mimeType: file.type,
        language,
        onProgress: setProgress,
      });
    },
    onSuccess: async () => {
      await invalidatePersonalDocumentQueries(queryClient);
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
        <NoPatientDataNotice />
        <div className="space-y-4">
          <DocumentFilePicker
            id="personal-document-file"
            label={t('fields.file')}
            hint={t('fields.fileHint')}
            onFileSelected={(selected) => {
              setError(null);
              setFile(selected);
            }}
            onRejected={setError}
          />
          <div className="space-y-2">
            <Label htmlFor="personal-document-title">{t('fields.title')}</Label>
            <Input
              id="personal-document-title"
              value={title}
              placeholder={file?.name ?? ''}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="personal-document-language">{t('fields.language')}</Label>
            <Select
              value={language}
              onValueChange={(value) => setLanguage(value as DocumentLanguageValue)}
            >
              <SelectTrigger id="personal-document-language">
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

'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DOCUMENT_LANGUAGES,
  type DocumentLanguageValue,
  type VaultDocumentCategoryValue,
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

import { DocumentFilePicker } from '#components/client/documents/document-file-picker';
import { UploadProgressIndicator } from '#components/client/documents/upload-progress-indicator';
import { VaultCategorySelect } from '#components/client/vault-documents/vault-category-select';
import { VaultPatientDataNotice } from '#components/client/vault-documents/vault-patient-data-notice';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { isAcceptedDocumentMimeType } from '#lib/documents/is-accepted-document-mime-type';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';
import { invalidateVaultDocumentQueries } from '#lib/vault-documents/invalidate-vault-document-queries';
import { uploadVaultDocument } from '#lib/vault-documents/upload-vault-document';

type VaultDocumentUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (message: string) => void;
};

/**
 * Adding a document to your own vault (US-E3-01).
 *
 * `DocumentFilePicker` does the pre-flight: an oversize or wrong-typed file is
 * refused **before any upload starts**, with a message naming the limit,
 * rather than after a round trip that was always going to fail. That is the
 * shared picker both upload flows mount, so the store's rules are stated once
 * in the browser and enforced properly at confirm on the bytes themselves.
 *
 * The filing fields are all optional. A person photographing their STR at the
 * end of a clinic day should be able to put it somewhere safe in three taps;
 * the category and dates can be added later from the edit dialog, and an
 * upload form that demanded them would mostly succeed at not being used.
 */
export function VaultDocumentUploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: VaultDocumentUploadDialogProps) {
  const t = useTranslations('vault.upload');
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<DocumentLanguageValue>('ID');
  const [vaultCategory, setVaultCategory] = useState<VaultDocumentCategoryValue | null>(null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<DocumentUploadProgress | null>(null);

  const hasBackwardsDates = issuedAt !== '' && expiresAt !== '' && expiresAt < issuedAt;

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error(t('errors.noFile'));
      }
      if (!isAcceptedDocumentMimeType(file.type)) {
        throw new Error(t('errors.unsupportedType'));
      }
      await uploadVaultDocument({
        file,
        title: title.trim() === '' ? file.name : title.trim(),
        mimeType: file.type,
        language,
        vaultCategory: vaultCategory ?? undefined,
        referenceNumber: referenceNumber.trim() === '' ? undefined : referenceNumber.trim(),
        issuedAt: issuedAt === '' ? undefined : issuedAt,
        expiresAt: expiresAt === '' ? undefined : expiresAt,
        onProgress: setProgress,
      });
    },
    onSuccess: async () => {
      await invalidateVaultDocumentQueries(queryClient);
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
    setVaultCategory(null);
    setReferenceNumber('');
    setIssuedAt('');
    setExpiresAt('');
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
        {/* Above the picker, not below the submit button: a warning has to be
            read before a file is chosen, not acknowledged after. */}
        <VaultPatientDataNotice />
        <div className="space-y-4">
          <DocumentFilePicker
            id="vault-document-file"
            label={t('fields.file')}
            hint={t('fields.fileHint')}
            onFileSelected={(selected) => {
              setError(null);
              setFile(selected);
            }}
            onRejected={setError}
          />
          <div className="space-y-2">
            <Label htmlFor="vault-document-title">{t('fields.title')}</Label>
            <Input
              id="vault-document-title"
              value={title}
              placeholder={file?.name ?? ''}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <VaultCategorySelect
            id="vault-document-category"
            value={vaultCategory}
            onChange={setVaultCategory}
          />
          <div className="space-y-2">
            <Label htmlFor="vault-document-reference">{t('fields.referenceNumber')}</Label>
            <Input
              id="vault-document-reference"
              value={referenceNumber}
              onChange={(event) => setReferenceNumber(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vault-document-issued">{t('fields.issuedAt')}</Label>
              <Input
                id="vault-document-issued"
                type="date"
                value={issuedAt}
                onChange={(event) => setIssuedAt(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vault-document-expires">{t('fields.expiresAt')}</Label>
              <Input
                id="vault-document-expires"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vault-document-language">{t('fields.language')}</Label>
            <Select
              value={language}
              onValueChange={(value) => setLanguage(value as DocumentLanguageValue)}
            >
              <SelectTrigger id="vault-document-language">
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
          {hasBackwardsDates ? (
            <p className="text-sm text-red-700">{t('errors.backwardsDates')}</p>
          ) : null}
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
            disabled={!file || hasBackwardsDates || uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
          >
            {uploadMutation.isPending ? t('actions.uploading') : t('actions.upload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

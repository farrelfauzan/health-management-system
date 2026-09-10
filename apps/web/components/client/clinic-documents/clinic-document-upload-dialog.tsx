'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DOCUMENT_LANGUAGES,
  DOCUMENT_VISIBILITIES,
  type DocumentLanguageValue,
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
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DocumentFilePicker } from '#components/client/documents/document-file-picker';
import { UploadFileItem } from '#components/client/documents/upload-file-item';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { uploadClinicDocumentBatch } from '#lib/clinic-documents/upload-clinic-document-batch';
import { invalidateClinicDocumentQueries } from '#lib/clinic-documents/invalidate-clinic-document-queries';
import { UnsupportedDocumentTypeError } from '#lib/documents/unsupported-document-type-error';
import type { UploadFileEntry } from '#lib/documents/upload-file-entry';
import type { UploadFileItemLabels } from '#lib/documents/upload-file-item-labels';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';

type ClinicDocumentUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (message: string) => void;
};

/**
 * Multi-file upload into the shared corpus (`P19-T15`).
 *
 * Seeding a clinic corpus is a bulk act — an admin arrives with the folder of
 * SOPs and FAQs the clinic already has, not with one file — so the dialog
 * takes as many files as the picker will give it and uploads them one after
 * another. It is the same batch the knowledge base got, over the same shared
 * row and the same picker.
 *
 * The batch is not all-or-nothing. Each file gets its own progress bar and its
 * own outcome, a failure settles its row and the rest continue, and pressing
 * upload again retries only the rows that failed. The list refreshes only when
 * at least one document was actually recorded.
 *
 * Titles are not editable here. Each document is recorded under its own
 * filename, which is what a curated folder of references already carries, and
 * the one document in twenty whose name is wrong is renamed afterwards from
 * the edit dialog — a row of twenty text inputs would make the common case
 * worse to spare the rare one.
 *
 * **Visibility defaults to `DOCTOR`, not `BOTH`, and stays one control for the
 * whole batch.** The safe default is the narrow one: an admin who forgets the
 * field gets staff-only documents, which answer too few questions, rather than
 * patient-facing ones, which are internal SOPs quoted to a stranger on
 * WhatsApp. Only one of those two mistakes is recoverable by editing the row
 * afterwards. Bulk does not weaken that — a folder is loaded for one audience
 * at a time, and a per-row audience picker would turn the field that carries
 * the consequence into twenty chances to leave one where the last pick left
 * it.
 */
export function ClinicDocumentUploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: ClinicDocumentUploadDialogProps) {
  const t = useTranslations('clinicCorpus.upload');
  const queryClient = useQueryClient();
  const nextEntryId = useRef(0);
  const [entries, setEntries] = useState<UploadFileEntry[]>([]);
  const [visibility, setVisibility] = useState<DocumentVisibilityValue>('DOCTOR');
  const [language, setLanguage] = useState<DocumentLanguageValue>('ID');
  const [pickerErrors, setPickerErrors] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  function resetForm(): void {
    setEntries([]);
    setVisibility('DOCTOR');
    setLanguage('ID');
    setPickerErrors([]);
    setFormError(null);
  }

  function updateEntry(id: string, patch: Partial<UploadFileEntry>): void {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }

  function handleFilesPicked(files: File[]): void {
    setFormError(null);
    const picked = files.map((file): UploadFileEntry => {
      nextEntryId.current += 1;
      return {
        id: `clinic-upload-${nextEntryId.current}`,
        file,
        title: file.name,
        progress: null,
        outcome: 'pending',
        errorMessage: null,
      };
    });
    setEntries((current) => [...current, ...picked]);
  }

  function handleRejected(message: string): void {
    setPickerErrors((current) => [...current, message]);
  }

  function resolveEntryError(error: unknown): string {
    if (error instanceof UnsupportedDocumentTypeError) {
      return t('errors.unsupportedType');
    }
    return resolveApiErrorMessage(error, t('errors.failed'));
  }

  function resolveRetryable(): UploadFileEntry[] {
    return entries.filter((entry) => entry.outcome === 'pending' || entry.outcome === 'failed');
  }

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const retryable = resolveRetryable();
      if (retryable.length === 0) {
        throw new Error(t('errors.noFiles'));
      }
      for (const entry of retryable) {
        updateEntry(entry.id, { outcome: 'pending', errorMessage: null, progress: null });
      }
      return uploadClinicDocumentBatch({
        items: retryable.map((entry) => ({ file: entry.file, title: entry.title })),
        // Pinned rather than offered. This screen is the FAQ corpus; a
        // GENERAL document would be stored and never embedded, which on a
        // knowledge-base screen is a silently useless upload.
        purpose: 'FAQ_KNOWLEDGE_BASE',
        visibility,
        language,
        onItemProgress: (index: number, progress: DocumentUploadProgress) => {
          const target = retryable[index];
          if (target) {
            updateEntry(target.id, { progress });
          }
        },
        onItemSettled: (result) => {
          const target = retryable[result.index];
          if (!target) {
            return;
          }
          updateEntry(target.id, {
            outcome: result.outcome,
            errorMessage: result.outcome === 'failed' ? resolveEntryError(result.error) : null,
          });
        },
      });
    },
    onSuccess: async (results) => {
      const failed = results.filter((result) => result.outcome === 'failed').length;
      const recorded = results.length - failed;
      // Nothing landed means nothing changed on the server; refetching the
      // list would only make the table flicker for no new rows.
      if (recorded > 0) {
        await invalidateClinicDocumentQueries(queryClient);
      }
      onUploaded(t('summary', { recorded, failed }));
      if (failed === 0) {
        resetForm();
        onOpenChange(false);
      }
    },
    onError: (err: unknown) => {
      setFormError(resolveApiErrorMessage(err, t('errors.failed')));
    },
  });

  function handleOpenChange(nextOpen: boolean): void {
    // Closing mid-batch would hide uploads that are still running; the dialog
    // stays open until every row has settled.
    if (!nextOpen && uploadMutation.isPending) {
      return;
    }
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  }

  const retryableCount = resolveRetryable().length;
  const isRunning = uploadMutation.isPending;
  const itemLabels: UploadFileItemLabels = {
    recorded: t('outcome.recorded'),
    // The clinic confirm has no conflict case, so a row never settles as
    // already-recorded here; the label exists only to satisfy the shared
    // row's contract.
    alreadyRecorded: t('outcome.recorded'),
    failed: t('outcome.failed'),
    buildRemoveLabel: (name) => t('actions.remove', { name }),
    buildProgressLabel: (progress) =>
      progress.stage === 'uploading'
        ? t('progress.uploading', { percent: progress.percent })
        : t(`progress.${progress.stage}`),
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <DocumentFilePicker
            id="clinic-document-files"
            label={t('fields.files')}
            hint={t('fields.filesHint')}
            multiple
            disabled={isRunning}
            onFilesSelected={handleFilesPicked}
            onRejected={handleRejected}
          />
          {pickerErrors.length > 0 ? (
            <InlineNotice tone="error">
              <ul className="space-y-1">
                {pickerErrors.map((message, index) => (
                  <li key={`${index}-${message}`}>{message}</li>
                ))}
              </ul>
            </InlineNotice>
          ) : null}
          {entries.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">
                {t('selected', { count: entries.length })}
              </p>
              <ul className="space-y-2">
                {entries.map((entry) => (
                  <UploadFileItem
                    key={entry.id}
                    entry={entry}
                    isBatchRunning={isRunning}
                    labels={itemLabels}
                    onRemove={(id) =>
                      setEntries((current) => current.filter((item) => item.id !== id))
                    }
                  />
                ))}
              </ul>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="clinic-document-visibility">{t('fields.visibility')}</Label>
            <Select
              value={visibility}
              disabled={isRunning}
              onValueChange={(value) => setVisibility(value as DocumentVisibilityValue)}
            >
              <SelectTrigger id="clinic-document-visibility" className="w-full">
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
              disabled={isRunning}
              onValueChange={(value) => setLanguage(value as DocumentLanguageValue)}
            >
              <SelectTrigger id="clinic-document-language" className="w-full">
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
            <p className="text-xs text-slate-500">{t('fields.languageHint')}</p>
          </div>
          {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isRunning}
            onClick={() => handleOpenChange(false)}
          >
            {retryableCount === 0 && entries.length > 0 ? t('actions.done') : t('actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={isRunning || retryableCount === 0}
            onClick={() => uploadMutation.mutate()}
          >
            {isRunning ? t('actions.uploading') : t('actions.upload', { count: retryableCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

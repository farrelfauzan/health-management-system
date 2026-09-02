'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DOCUMENT_CATEGORIES, type DocumentCategoryValue } from '@hms/shared-types';
import {
  Button,
  DatePicker,
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
  Textarea,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DocumentFilePicker } from '#components/client/documents/document-file-picker';
import { UploadFileItem } from '#components/client/patient-documents/upload-file-item';
import { VisitLinkSelect } from '#components/client/patient-documents/visit-link-select';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';
import { invalidatePatientDocumentQueries } from '#lib/patient-documents/invalidate-patient-document-queries';
import { parseVisitLinkValue } from '#lib/patient-documents/parse-visit-link-value';
import { PATIENT_DOCUMENT_ACCEPTED_MIME_TYPES } from '#lib/patient-documents/patient-document-accepted-mime-types';
import { PatientDocumentUploadError } from '#lib/patient-documents/patient-document-upload-error';
import type { UploadFileEntry } from '#lib/patient-documents/upload-file-entry';
import { uploadPatientDocumentBatch } from '#lib/patient-documents/upload-patient-document-batch';
import { VISIT_LINK_NONE } from '#lib/patient-documents/visit-link-value';

type UploadDocumentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  onUploaded: (message: string) => void;
};

type CategoryChoice = DocumentCategoryValue | '';

/**
 * Multi-file upload into one patient's record (`P16-T13`).
 *
 * Pick several files, describe them once. Category, document date, notes,
 * and the visit link are shared across the batch — a clinician uploading
 * four pages of one lab report should not fill four forms — while the title
 * stays per file, defaulting to the filename, because it is the one field
 * that differs between them.
 *
 * The batch is not all-or-nothing. Each file gets its own progress bar and
 * its own outcome, a failure settles its row and the rest continue, and
 * pressing upload again retries only the rows that failed. A file that
 * uploaded but could not be recorded says so in those words: the bytes are
 * in storage and no row names them, and the remedy is to pick it again.
 */
export function UploadDocumentDialog({
  open,
  onOpenChange,
  patientId,
  onUploaded,
}: UploadDocumentDialogProps) {
  const t = useTranslations('clinical.patients.documents.uploadDialog');
  const tCategories = useTranslations('clinical.patients.documents.categories');
  const queryClient = useQueryClient();
  const nextEntryId = useRef(0);
  const [entries, setEntries] = useState<UploadFileEntry[]>([]);
  const [category, setCategory] = useState<CategoryChoice>('');
  const [documentDate, setDocumentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [visitLink, setVisitLink] = useState(VISIT_LINK_NONE);
  const [pickerErrors, setPickerErrors] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  function resetForm(): void {
    setEntries([]);
    setCategory('');
    setDocumentDate('');
    setNotes('');
    setVisitLink(VISIT_LINK_NONE);
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
        id: `upload-${nextEntryId.current}`,
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
    if (error instanceof PatientDocumentUploadError) {
      return t(`errors.${error.stage}`);
    }
    return resolveApiErrorMessage(error, t('errors.failed'));
  }

  function resolveRetryable(): UploadFileEntry[] {
    return entries.filter((entry) => entry.outcome === 'pending' || entry.outcome === 'failed');
  }

  function validate(retryable: UploadFileEntry[]): string | null {
    if (retryable.length === 0) {
      return t('errors.noFiles');
    }
    if (retryable.some((entry) => entry.title.trim() === '')) {
      return t('errors.titleRequired');
    }
    if (category === '') {
      return t('errors.categoryRequired');
    }
    return null;
  }

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const retryable = resolveRetryable();
      const validationError = validate(retryable);
      if (validationError !== null || category === '') {
        throw new Error(validationError ?? t('errors.categoryRequired'));
      }
      const link = parseVisitLinkValue(visitLink);
      for (const entry of retryable) {
        updateEntry(entry.id, { outcome: 'pending', errorMessage: null, progress: null });
      }
      return uploadPatientDocumentBatch({
        patientId,
        items: retryable.map((entry) => ({ file: entry.file, title: entry.title.trim() })),
        shared: {
          category,
          ...(documentDate ? { documentDate } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(link.encounterId ? { encounterId: link.encounterId } : {}),
          ...(link.admissionId ? { admissionId: link.admissionId } : {}),
        },
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
      if (recorded > 0) {
        await invalidatePatientDocumentQueries(queryClient, patientId);
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
    // Closing mid-batch would hide uploads that are still running; the
    // dialog stays open until every row has settled.
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <DocumentFilePicker
            id="patient-document-files"
            label={t('files')}
            hint={t('filesHint')}
            accept={PATIENT_DOCUMENT_ACCEPTED_MIME_TYPES}
            multiple
            disabled={isRunning}
            onFilesSelected={handleFilesPicked}
            onRejected={handleRejected}
          />
          {pickerErrors.length > 0 ? (
            <ul className="space-y-1" role="alert">
              {pickerErrors.map((message, index) => (
                <li key={`${index}-${message}`} className="text-sm text-red-700">
                  {message}
                </li>
              ))}
            </ul>
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
                    onTitleChange={(id, title) => updateEntry(id, { title })}
                    onRemove={(id) =>
                      setEntries((current) => current.filter((entry) => entry.id !== id))
                    }
                  />
                ))}
              </ul>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="patient-document-category">{t('category')}</Label>
              <Select
                value={category}
                disabled={isRunning}
                onValueChange={(value) => setCategory(value as DocumentCategoryValue)}
              >
                <SelectTrigger id="patient-document-category" className="w-full">
                  <SelectValue placeholder={t('categoryPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {tCategories(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-document-date">{t('documentDate')}</Label>
              <DatePicker
                id="patient-document-date"
                value={documentDate}
                disabled={isRunning}
                onValueChange={setDocumentDate}
              />
              <p className="text-xs text-slate-500">{t('documentDateHint')}</p>
            </div>
          </div>
          <VisitLinkSelect
            id="patient-document-visit"
            patientId={patientId}
            value={visitLink}
            disabled={isRunning}
            onValueChange={setVisitLink}
          />
          <div className="space-y-2">
            <Label htmlFor="patient-document-notes">{t('notes')}</Label>
            <Textarea
              id="patient-document-notes"
              rows={2}
              value={notes}
              disabled={isRunning}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
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

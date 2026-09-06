'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MAX_MANAGED_DOCUMENT_NUMBER_LENGTH,
  MAX_MANAGED_DOCUMENT_TITLE_LENGTH,
  validateManagedDocumentAgainstType,
  type CreateManagedDocumentInput,
  type ManagedDocumentDetailView,
  type ManagedDocumentRuleIssue,
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

import { ManagedDocumentContentFields } from '#components/client/managed-documents/managed-document-content-fields';
import { ManagedDocumentPartyFields } from '#components/client/managed-documents/managed-document-party-fields';
import { managedDocumentControllerCreateDocumentV1 } from '#lib/api/generated/documents/documents';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { useDocumentTypes } from '#lib/document-types/use-document-types';
import { isAcceptedDocumentMimeType } from '#lib/documents/is-accepted-document-mime-type';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';
import { invalidateManagedDocumentQueries } from '#lib/managed-documents/invalidate-managed-document-queries';
import { ManagedDocumentUploadError } from '#lib/managed-documents/managed-document-upload-error';
import {
  resolveContentChoice,
  type ManagedDocumentContentChoice,
} from '#lib/managed-documents/resolve-content-choice';
import { uploadManagedDocumentFile } from '#lib/managed-documents/upload-managed-document-file';

type NewManagedDocumentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (message: string) => void;
};

/**
 * The new-document form, built from the chosen type's flags (`P16-T36`,
 * FR-E5-35). Choosing a type is what makes the form appear: a patient
 * picker only if the type names a patient, a doctor picker only if it names
 * a doctor, and the body control the content mode allows. The same
 * `validateManagedDocumentAgainstType` the API runs is run here before
 * submit, so the drafter sees the rule they broke on the field rather than
 * as a server message — and the server checks again regardless.
 *
 * An upload is sign → PUT → one POST with the storage key. A failure after
 * the PUT leaves a staged object and no row, never the reverse.
 */
export function NewManagedDocumentDialog({
  open,
  onOpenChange,
  onCreated,
}: NewManagedDocumentDialogProps) {
  const t = useTranslations('operations.documents.form');
  const common = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const typesQuery = useDocumentTypes(false, open);
  const [typeId, setTypeId] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [documentNumber, setDocumentNumber] = useState<string>('');
  const [patientId, setPatientId] = useState<string>('');
  const [doctorId, setDoctorId] = useState<string>('');
  const [choice, setChoice] = useState<ManagedDocumentContentChoice>('draft');
  const [contentHtml, setContentHtml] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<DocumentUploadProgress | null>(null);
  const [issues, setIssues] = useState<ManagedDocumentRuleIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const selectedType = typesQuery.types.find((type) => type.id === typeId) ?? null;
  const resolvedChoice = resolveContentChoice(selectedType?.contentMode ?? null, choice);

  const createMutation = useMutation({
    mutationFn: async (): Promise<ManagedDocumentDetailView> => {
      const payload = await buildPayload();
      setProgress(file === null ? null : { stage: 'scanning' });
      const envelope = parseApiSuccess<ManagedDocumentDetailView>(
        await managedDocumentControllerCreateDocumentV1(payload),
        t('errors.save'),
      );
      setProgress(file === null ? null : { stage: 'complete' });
      return envelope.data;
    },
    onSuccess: async () => {
      await invalidateManagedDocumentQueries(queryClient);
      onCreated(t('created'));
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      setProgress(null);
      setError(describeError(err));
    },
  });

  function describeError(err: unknown): string {
    if (err instanceof ManagedDocumentUploadError) {
      return t(`errors.${err.stage}`);
    }
    return resolveApiErrorMessage(err, t('errors.save'));
  }

  async function buildPayload(): Promise<CreateManagedDocumentInput> {
    const base: CreateManagedDocumentInput = {
      typeId,
      title: title.trim(),
      ...(documentNumber.trim() === '' ? {} : { documentNumber: documentNumber.trim() }),
      ...(patientId === '' ? {} : { patientId }),
      ...(doctorId === '' ? {} : { doctorId }),
    };
    if (resolvedChoice === 'upload' && file !== null && isAcceptedDocumentMimeType(file.type)) {
      const storageKey = await uploadManagedDocumentFile({
        file,
        mimeType: file.type,
        onProgress: setProgress,
      });
      return { ...base, storageKey };
    }
    return { ...base, contentHtml };
  }

  function validate(): boolean {
    if (selectedType === null) {
      setError(t('errors.typeRequired'));
      return false;
    }
    if (title.trim() === '') {
      setError(t('errors.titleRequired'));
      return false;
    }
    if (resolvedChoice === 'upload' && file === null) {
      setError(t('errors.fileRequired'));
      return false;
    }
    const found = validateManagedDocumentAgainstType(selectedType, {
      patientId: patientId === '' ? null : patientId,
      doctorId: doctorId === '' ? null : doctorId,
      hasContentHtml: resolvedChoice === 'draft',
      hasStorageKey: resolvedChoice === 'upload',
    });
    setIssues(found);
    return found.length === 0;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    if (!validate()) {
      return;
    }
    createMutation.mutate();
  }

  function handleTypeChange(nextTypeId: string): void {
    setTypeId(nextTypeId);
    setPatientId('');
    setDoctorId('');
    setIssues([]);
  }

  const isBusy = createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
              {error}
            </p>
          ) : null}
          {issues.length > 0 ? (
            <ul
              role="alert"
              className="space-y-1 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              {issues.map((issue) => (
                <li key={`${issue.code}-${issue.field}`}>{t(`issues.${issue.code}`)}</li>
              ))}
            </ul>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="managed-document-type">{t('type')}</Label>
            <Select value={typeId} onValueChange={handleTypeChange} disabled={isBusy}>
              <SelectTrigger id="managed-document-type" className="w-full">
                <SelectValue
                  placeholder={typesQuery.isPending ? t('typesLoading') : t('typePlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {typesQuery.types
                  .filter((type) => type.behavior !== 'PATIENT_BILL')
                  .map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {typesQuery.isError ? <p className="text-xs text-red-700">{t('typesError')}</p> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="space-y-2">
              <Label htmlFor="managed-document-title">{t('documentTitle')}</Label>
              <Input
                id="managed-document-title"
                value={title}
                placeholder={t('documentTitlePlaceholder')}
                maxLength={MAX_MANAGED_DOCUMENT_TITLE_LENGTH}
                disabled={isBusy}
                required
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="managed-document-number">{t('documentNumber')}</Label>
              <Input
                id="managed-document-number"
                value={documentNumber}
                placeholder={t('documentNumberPlaceholder')}
                maxLength={MAX_MANAGED_DOCUMENT_NUMBER_LENGTH}
                disabled={isBusy}
                onChange={(event) => setDocumentNumber(event.target.value)}
              />
            </div>
          </div>
          {selectedType ? (
            <ManagedDocumentPartyFields
              type={selectedType}
              patientId={patientId}
              doctorId={doctorId}
              disabled={isBusy}
              onPatientChange={setPatientId}
              onDoctorChange={setDoctorId}
            />
          ) : null}
          <ManagedDocumentContentFields
            contentMode={selectedType?.contentMode ?? null}
            choice={choice}
            contentHtml={contentHtml}
            file={file}
            progress={progress}
            disabled={isBusy}
            onChoiceChange={setChoice}
            onContentHtmlChange={setContentHtml}
            onFileChange={setFile}
            onFileRejected={(message) => setError(message)}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
            >
              {common('cancel')}
            </Button>
            <Button type="submit" disabled={isBusy || selectedType === null}>
              {isBusy ? t('submitting') : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

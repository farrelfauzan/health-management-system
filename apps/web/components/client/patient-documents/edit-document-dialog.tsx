'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DOCUMENT_CATEGORIES,
  type DocumentCategoryValue,
  type PatientDocumentView,
} from '@hms/shared-types';
import {
  Button,
  DatePicker,
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
  Textarea,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { VisitLinkSelect } from '#components/client/patient-documents/visit-link-select';
import { patientDocumentDetailControllerUpdateDocumentV1 } from '#lib/api/generated/document-management/document-management';
import type { UpdatePatientDocumentDto } from '#lib/api/generated/model/updatePatientDocumentDto';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { formatVisitLinkValue } from '#lib/patient-documents/format-visit-link-value';
import { invalidatePatientDocumentQueries } from '#lib/patient-documents/invalidate-patient-document-queries';
import { parseVisitLinkValue } from '#lib/patient-documents/parse-visit-link-value';

type EditDocumentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  document: PatientDocumentView;
  onSaved: (message: string) => void;
  onFailed: (message: string) => void;
};

/**
 * Edits a document's metadata: title, category, date, notes, and the visit
 * it is filed under. Never the file — a wrong scan is deleted with a reason
 * and uploaded again, which is what keeps the stored object immutable and
 * the audit trail honest.
 *
 * Only the fields that changed are sent, and if none did the dialog refuses
 * rather than round-tripping an empty patch the API would reject anyway.
 * The caller mounts this only while open, so the initial state is read
 * straight from the document with no reset effect.
 */
export function EditDocumentDialog({
  open,
  onOpenChange,
  patientId,
  document,
  onSaved,
  onFailed,
}: EditDocumentDialogProps) {
  const t = useTranslations('clinical.patients.documents.editDialog');
  const tCategories = useTranslations('clinical.patients.documents.categories');
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(document.title);
  const [category, setCategory] = useState<DocumentCategoryValue>(document.category);
  const [documentDate, setDocumentDate] = useState(document.documentDate ?? '');
  const [notes, setNotes] = useState(document.notes ?? '');
  const [visitLink, setVisitLink] = useState(formatVisitLinkValue(document));
  const [error, setError] = useState<string | null>(null);

  function buildPatch(): UpdatePatientDocumentDto {
    const patch: UpdatePatientDocumentDto = {};
    if (title.trim() !== document.title) {
      patch.title = title.trim();
    }
    if (category !== document.category) {
      patch.category = category;
    }
    const nextDate = documentDate === '' ? null : documentDate;
    if (nextDate !== document.documentDate) {
      patch.documentDate = nextDate;
    }
    const nextNotes = notes.trim() === '' ? null : notes.trim();
    if (nextNotes !== document.notes) {
      patch.notes = nextNotes;
    }
    if (visitLink !== formatVisitLinkValue(document)) {
      // Both are sent so a move from a visit to an admission clears the old
      // link in the same write; the schema allows one to be set only when
      // the other is null.
      const link = parseVisitLinkValue(visitLink);
      patch.encounterId = link.encounterId ?? null;
      patch.admissionId = link.admissionId ?? null;
    }
    return patch;
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (title.trim() === '') {
        throw new Error(t('titleRequired'));
      }
      const patch = buildPatch();
      if (Object.keys(patch).length === 0) {
        throw new Error(t('noChanges'));
      }
      parseApiSuccess(
        await patientDocumentDetailControllerUpdateDocumentV1(document.id, patch),
        t('error'),
      );
    },
    onSuccess: async () => {
      await invalidatePatientDocumentQueries(queryClient, patientId);
      onOpenChange(false);
      onSaved(t('success'));
    },
    onError: (err: unknown) => {
      const message = resolveApiErrorMessage(err, t('error'));
      setError(message);
      onFailed(message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="patient-document-edit-title">{t('fields.title')}</Label>
            <Input
              id="patient-document-edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="patient-document-edit-category">{t('fields.category')}</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as DocumentCategoryValue)}
              >
                <SelectTrigger id="patient-document-edit-category" className="w-full">
                  <SelectValue />
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
              <Label htmlFor="patient-document-edit-date">{t('fields.documentDate')}</Label>
              <DatePicker
                id="patient-document-edit-date"
                value={documentDate}
                onValueChange={setDocumentDate}
              />
            </div>
          </div>
          <VisitLinkSelect
            id="patient-document-edit-visit"
            patientId={patientId}
            value={visitLink}
            onValueChange={setVisitLink}
          />
          <div className="space-y-2">
            <Label htmlFor="patient-document-edit-notes">{t('fields.notes')}</Label>
            <Textarea
              id="patient-document-edit-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PatientDocumentView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { patientDocumentDetailControllerDeleteDocumentV1 } from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { invalidatePatientDocumentQueries } from '#lib/patient-documents/invalidate-patient-document-queries';

type DeleteDocumentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  document: PatientDocumentView;
  onDeleted: (message: string) => void;
  onFailed: (message: string) => void;
};

/**
 * Retires a clinical file, with the reason the API requires (FR-E2-11).
 *
 * Required rather than optional because these rows sit under the 25-year
 * medical-record retention floor: a removal is an exception to that rule,
 * and the reason is the only account of why the exception was made. The
 * delete is soft on the API — the object stays, the row is retired — and
 * the reason is recorded with it.
 */
export function DeleteDocumentDialog({
  open,
  onOpenChange,
  patientId,
  document,
  onDeleted,
  onFailed,
}: DeleteDocumentDialogProps) {
  const t = useTranslations('clinical.patients.documents.deleteDialog');
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (reason.trim() === '') {
        throw new Error(t('reasonRequired'));
      }
      parseApiSuccess(
        await patientDocumentDetailControllerDeleteDocumentV1(document.id, {
          reason: reason.trim(),
        }),
        t('error'),
      );
    },
    onSuccess: async () => {
      await invalidatePatientDocumentQueries(queryClient, patientId);
      onOpenChange(false);
      onDeleted(t('success'));
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
          <DialogDescription>{t('description', { title: document.title })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="patient-document-delete-reason">{t('reason')}</Label>
          <Textarea
            id="patient-document-delete-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

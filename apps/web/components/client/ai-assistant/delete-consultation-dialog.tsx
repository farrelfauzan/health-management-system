'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import {
  chatControllerDeleteSessionV1,
  getChatControllerListSessionsV1QueryKey,
} from '#lib/api/generated/ai-chatbot/ai-chatbot';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import type { ConsultationHistoryEntry } from '#lib/ai-assistant/consultation-history-entry';

type DeleteConsultationDialogProps = {
  entry: ConsultationHistoryEntry | null;
  onOpenChange: (isOpen: boolean) => void;
  onDeleted: (sessionId: string) => void;
};

/**
 * Confirms removing a consultation from the history list.
 *
 * The copy says "removed from your list", not "deleted", because that is what
 * happens: the API soft-deletes the session and keeps the transcript, since
 * PMK 24/2022 requires the record of what a patient was told to survive.
 * Telling a clinician their patient's transcript is gone when it is retained
 * would be the more comfortable wording and the wrong one.
 */
export function DeleteConsultationDialog({
  entry,
  onOpenChange,
  onDeleted,
}: DeleteConsultationDialogProps) {
  const t = useTranslations('aiAssistant.sidebar');
  const queryClient = useQueryClient();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => chatControllerDeleteSessionV1(sessionId),
  });
  async function handleDelete(sessionId: string): Promise<void> {
    setDeleteError(null);
    try {
      const response = await deleteMutation.mutateAsync(sessionId);
      parseApiSuccess<{ id: string }>(response, t('deleteError'));
      await queryClient.invalidateQueries({
        queryKey: getChatControllerListSessionsV1QueryKey(),
      });
      onDeleted(sessionId);
      onOpenChange(false);
    } catch (error) {
      setDeleteError(notifyApiError(error, t('deleteError')));
    }
  }
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('deleteDescription', { title: entry?.title ?? '' })}
          </DialogDescription>
        </DialogHeader>
        {deleteError ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {deleteError}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('deleteCancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteMutation.isPending || entry === null}
            onClick={() => entry !== null && void handleDelete(entry.id)}
          >
            {deleteMutation.isPending ? t('deleting') : t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

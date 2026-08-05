'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PersonalDocumentView } from '@hms/shared-types';
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
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { personalDocumentControllerUpdateDocumentV1 } from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { invalidatePersonalDocumentQueries } from '#lib/personal-documents/invalidate-personal-document-queries';

type PersonalDocumentRenameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: PersonalDocumentView;
  onSaved: (message: string) => void;
  onFailed: (message: string) => void;
};

/**
 * Renames a document. Only the title is editable here.
 *
 * `language` is intentionally not offered: changing it discards the chunks and
 * returns the document to `PENDING`, so it is a re-ingest wearing the costume
 * of a metadata edit. Re-uploading with the right language is the honest way
 * to do that, and it does not silently make a working document unanswerable.
 */
export function PersonalDocumentRenameDialog({
  open,
  onOpenChange,
  document,
  onSaved,
  onFailed,
}: PersonalDocumentRenameDialogProps) {
  const t = useTranslations('personalKnowledgeBase.rename');
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(document.title);

  useEffect(() => {
    if (open) {
      setTitle(document.title);
    }
  }, [open, document.title]);

  const renameMutation = useMutation({
    mutationFn: async () => {
      parseApiSuccess(
        await personalDocumentControllerUpdateDocumentV1(document.id, { title: title.trim() }),
        t('error'),
      );
    },
    onSuccess: async () => {
      await invalidatePersonalDocumentQueries(queryClient);
      onOpenChange(false);
      onSaved(t('success'));
    },
    onError: (err: unknown) => {
      onOpenChange(false);
      onFailed(resolveApiErrorMessage(err, t('error')));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="personal-document-rename">{t('field')}</Label>
          <Input
            id="personal-document-rename"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={title.trim() === '' || renameMutation.isPending}
            onClick={() => renameMutation.mutate()}
          >
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

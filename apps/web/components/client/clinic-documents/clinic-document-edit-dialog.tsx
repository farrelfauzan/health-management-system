'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DOCUMENT_VISIBILITIES,
  type ClinicDocumentView,
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

import { documentAdminControllerUpdateDocumentV1 } from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateClinicDocumentQueries } from '#lib/clinic-documents/invalidate-clinic-document-queries';

type ClinicDocumentEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: ClinicDocumentView;
  onSaved: (message: string) => void;
  onFailed: (message: string) => void;
};

/**
 * Edits a clinic document's title and visibility.
 *
 * **Visibility is offered here even though changing it discards the chunks**,
 * which is the opposite of the call made for `language` on a personal
 * document. The reason is that the two edits are not the same kind of act. A
 * language change is a re-ingest wearing the costume of a metadata edit, and
 * re-uploading is the honest way to do it. A visibility change is a *policy*
 * decision — someone has realised an internal SOP is answering patients — and
 * there must be a way to stop that in one step. The document going briefly
 * unsearchable is the correct trade: temporarily unanswerable beats
 * indefinitely over-shared.
 *
 * The cost is stated in the dialog rather than discovered on the list
 * afterwards, because an admin who does not know the document leaves the
 * corpus for a few minutes will read the resulting `PENDING` as a bug.
 *
 * `language` is not offered, for the personal corpus's reason: it carries the
 * same chunk-discarding cost with none of the safety upside.
 */
export function ClinicDocumentEditDialog({
  open,
  onOpenChange,
  document,
  onSaved,
  onFailed,
}: ClinicDocumentEditDialogProps) {
  const t = useTranslations('clinicCorpus.edit');
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(document.title);
  const [visibility, setVisibility] = useState<DocumentVisibilityValue>(document.visibility);

  useEffect(() => {
    if (open) {
      setTitle(document.title);
      setVisibility(document.visibility);
    }
  }, [open, document.title, document.visibility]);

  const isVisibilityChanged = visibility !== document.visibility;

  const saveMutation = useMutation({
    mutationFn: async () => {
      parseApiSuccess(
        await documentAdminControllerUpdateDocumentV1(document.id, {
          title: title.trim(),
          // Sent only when it actually changed: an unchanged value still
          // counts as a visibility write on the API, which would discard the
          // chunks of a document whose title was the only thing edited.
          ...(isVisibilityChanged ? { visibility } : {}),
        }),
        t('error'),
      );
    },
    onSuccess: async () => {
      await invalidateClinicDocumentQueries(queryClient);
      onOpenChange(false);
      onSaved(isVisibilityChanged ? t('successWithReingest') : t('success'));
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
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clinic-document-edit-title">{t('fields.title')}</Label>
            <Input
              id="clinic-document-edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clinic-document-edit-visibility">{t('fields.visibility')}</Label>
            <Select
              value={visibility}
              onValueChange={(value) => setVisibility(value as DocumentVisibilityValue)}
            >
              <SelectTrigger id="clinic-document-edit-visibility">
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
          </div>
          {isVisibilityChanged ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {/*
                FR-E5-20: on an *issued* document, changing visibility is a
                new decision rather than an edit — the field decides whether
                the assistant may quote this document to a patient — so it
                goes back for approval and leaves the retrieval candidate set
                until somebody signs it off. Saying so here is the difference
                between a deliberate change and an admin wondering why the bot
                stopped citing a document they only renamed the audience of.
              */}
              {document.approval.status === 'ISSUED'
                ? t('reapprovalWarning')
                : t('reingestWarning')}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={title.trim() === '' || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

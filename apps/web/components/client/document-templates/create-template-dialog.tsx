'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDocumentTemplateInput,
  DocumentTemplateKindValue,
  DocumentTemplateView,
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
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { documentTemplateControllerCreateTemplateV1 } from '#lib/api/generated/document-templates/document-templates';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateDocumentTemplateQueries } from '#lib/document-templates/invalidate-document-template-queries';

type CreateTemplateDialogProps = {
  open: boolean;
  kind: DocumentTemplateKindValue;
  onOpenChange: (open: boolean) => void;
  onCreated: (template: DocumentTemplateView) => void;
};

export function CreateTemplateDialog({
  open,
  kind,
  onOpenChange,
  onCreated,
}: CreateTemplateDialogProps) {
  const t = useTranslations('operations.billing.templates.create');
  const queryClient = useQueryClient();
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: async (payload: CreateDocumentTemplateInput) =>
      parseApiSuccess<DocumentTemplateView>(
        await documentTemplateControllerCreateTemplateV1(payload),
        t('error'),
      ),
    onSuccess: async (envelope) => {
      await invalidateDocumentTemplateQueries(queryClient);
      onCreated(envelope.data);
    },
    onError: (err: unknown) => setError(resolveApiErrorMessage(err, t('error'))),
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    const trimmedDescription = description.trim();
    createMutation.mutate({
      kind,
      name: name.trim(),
      contentHtml: '',
      settings: {} as CreateDocumentTemplateInput['settings'],
      ...(trimmedDescription === '' ? {} : { description: trimmedDescription }),
    });
  }

  const isSubmitDisabled = createMutation.isPending || name.trim() === '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
          <div className="space-y-2">
            <Label htmlFor="document-template-name">{t('name')}</Label>
            <Input
              id="document-template-name"
              value={name}
              placeholder={t('namePlaceholder')}
              maxLength={120}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="document-template-description">{t('descriptionLabel')}</Label>
            <Input
              id="document-template-description"
              value={description}
              placeholder={t('descriptionPlaceholder')}
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              {t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

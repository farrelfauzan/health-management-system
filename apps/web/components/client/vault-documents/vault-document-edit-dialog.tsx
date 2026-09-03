'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VaultDocumentCategoryValue, VaultDocumentView } from '@hms/shared-types';
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

import { VaultCategorySelect } from '#components/client/vault-documents/vault-category-select';
import { vaultDocumentControllerUpdateDocumentV1 } from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateVaultDocumentQueries } from '#lib/vault-documents/invalidate-vault-document-queries';

type VaultDocumentEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: VaultDocumentView;
  onSaved: (message: string) => void;
};

/**
 * Renames and re-files one of the owner's own documents (FR-E3-01).
 *
 * Everything here is the owner's note to themselves. The stored file is
 * immutable — there is no replace-the-scan action, because a document whose
 * bytes changed under the same reference number is a different document — and
 * nothing on this form is validated against an external register, because
 * nothing in this product is entitled to audit a doctor's paperwork.
 *
 * An empty date field clears the stored one, which is how a date entered by
 * mistake is removed: the API takes `null` for exactly that, and a form that
 * could only ever set a date would leave a wrong expiry raising reminders
 * forever.
 */
export function VaultDocumentEditDialog({
  open,
  onOpenChange,
  document,
  onSaved,
}: VaultDocumentEditDialogProps) {
  const t = useTranslations('vault.edit');
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(document.title);
  const [vaultCategory, setVaultCategory] = useState<VaultDocumentCategoryValue | null>(
    document.vaultCategory,
  );
  const [referenceNumber, setReferenceNumber] = useState(document.referenceNumber ?? '');
  const [issuedAt, setIssuedAt] = useState(document.issuedAt ?? '');
  const [expiresAt, setExpiresAt] = useState(document.expiresAt ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(document.title);
      setVaultCategory(document.vaultCategory);
      setReferenceNumber(document.referenceNumber ?? '');
      setIssuedAt(document.issuedAt ?? '');
      setExpiresAt(document.expiresAt ?? '');
      setError(null);
    }
  }, [open, document]);

  const hasBackwardsDates = issuedAt !== '' && expiresAt !== '' && expiresAt < issuedAt;

  const saveMutation = useMutation({
    mutationFn: async () => {
      parseApiSuccess(
        await vaultDocumentControllerUpdateDocumentV1(document.id, {
          title: title.trim(),
          vaultCategory,
          // An emptied field is sent as `null` rather than omitted: omitting
          // it would leave the stored value in place, so there would be no way
          // to take a wrong date back off a document.
          referenceNumber: referenceNumber.trim() === '' ? null : referenceNumber.trim(),
          issuedAt: issuedAt === '' ? null : issuedAt,
          expiresAt: expiresAt === '' ? null : expiresAt,
        }),
        t('error'),
      );
    },
    onSuccess: async () => {
      await invalidateVaultDocumentQueries(queryClient);
      onOpenChange(false);
      onSaved(t('success'));
    },
    // Reported inside the dialog rather than handed to the panel: the dialog
    // stays open on failure, so a message on the page behind it would be a
    // message the person cannot see while they fix the field it is about.
    onError: (err: unknown) => {
      setError(resolveApiErrorMessage(err, t('error')));
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
            <Label htmlFor="vault-edit-title">{t('fields.title')}</Label>
            <Input
              id="vault-edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <VaultCategorySelect
            id="vault-edit-category"
            value={vaultCategory}
            onChange={setVaultCategory}
          />
          <div className="space-y-2">
            <Label htmlFor="vault-edit-reference">{t('fields.referenceNumber')}</Label>
            <Input
              id="vault-edit-reference"
              value={referenceNumber}
              onChange={(event) => setReferenceNumber(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vault-edit-issued">{t('fields.issuedAt')}</Label>
              <Input
                id="vault-edit-issued"
                type="date"
                value={issuedAt}
                onChange={(event) => setIssuedAt(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vault-edit-expires">{t('fields.expiresAt')}</Label>
              <Input
                id="vault-edit-expires"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </div>
          </div>
          {hasBackwardsDates ? (
            <p className="text-sm text-red-700">{t('errors.backwardsDates')}</p>
          ) : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={title.trim() === '' || hasBackwardsDates || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

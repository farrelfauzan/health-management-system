'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VaultDocumentShareRecipientView, VaultDocumentView } from '@hms/shared-types';
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

import { ShareRecipientPicker } from '#components/client/vault-shares/share-recipient-picker';
import { ShareRevocationNotice } from '#components/client/vault-shares/share-revocation-notice';
import { vaultDocumentShareControllerCreateShareV1 } from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateShareQueries } from '#lib/vault-shares/invalidate-share-queries';

type ShareDocumentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * One or more documents to hand over. Multi-select creates **one share per
   * document per person** (FR-E3-21) — the API takes a single document and a
   * single grantee per call, and this dialog batches over both rather than
   * the API growing a share-my-whole-vault mode.
   */
  documents: VaultDocumentView[];
  onShared: (message: string) => void;
};

export function ShareDocumentDialog({
  open,
  onOpenChange,
  documents,
  onShared,
}: ShareDocumentDialogProps) {
  const t = useTranslations('vault.sharing.dialog');
  const queryClient = useQueryClient();
  const [recipients, setRecipients] = useState<VaultDocumentShareRecipientView[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const shareMutation = useMutation({
    mutationFn: async () => {
      if (recipients.length === 0) {
        throw new Error(t('errors.noRecipient'));
      }
      // A date input gives a day; the API takes an instant. End of that day
      // in the viewer's zone is the reading a person means by "until the
      // 30th".
      const expiresAtInstant =
        expiresAt === '' ? undefined : new Date(`${expiresAt}T23:59:59`).toISOString();
      // One call per document per person, in order. Sequential rather than
      // parallel so a failure halfway leaves a state the person can read off
      // the panel — the first N shared — rather than an arbitrary subset.
      for (const document of documents) {
        for (const recipient of recipients) {
          parseApiSuccess(
            await vaultDocumentShareControllerCreateShareV1(document.id, {
              granteeId: recipient.id,
              expiresAt: expiresAtInstant,
            }),
            t('errors.failed'),
          );
        }
      }
    },
    onSuccess: () => {
      onShared(t('success', { count: documents.length, recipientCount: recipients.length }));
      resetForm();
      onOpenChange(false);
    },
    onError: (err: unknown) => setError(resolveApiErrorMessage(err, t('errors.failed'))),
    // On failure as well as success: the shares made before the failing call
    // exist, and the panel behind this dialog should show them.
    onSettled: async () => {
      for (const document of documents) {
        await invalidateShareQueries(queryClient, document.id);
      }
    },
  });

  function resetForm(): void {
    setRecipients([]);
    setExpiresAt('');
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && shareMutation.isPending) {
      return;
    }
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title', { count: documents.length })}</DialogTitle>
          <DialogDescription>
            {documents.length === 1
              ? t('descriptionOne', { title: documents[0]?.title ?? '' })
              : t('descriptionMany', { count: documents.length })}
          </DialogDescription>
        </DialogHeader>
        {/* Before the share exists, not after. Revocation stops future
            fetches; it cannot recall a copy already downloaded, and a person
            deciding whether to hand over their KTP is entitled to know that
            while they are still deciding. */}
        <ShareRevocationNotice />
        <div className="space-y-4">
          <ShareRecipientPicker selected={recipients} onChange={setRecipients} />
          <div className="space-y-2">
            <Label htmlFor="vault-share-expiry">{t('fields.expiresAt')}</Label>
            <Input
              id="vault-share-expiry"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
            <p className="text-xs text-slate-500">{t('fields.expiresAtHint')}</p>
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={shareMutation.isPending}
            onClick={() => handleOpenChange(false)}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={recipients.length === 0 || shareMutation.isPending}
            onClick={() => shareMutation.mutate()}
          >
            {shareMutation.isPending
              ? t('sharing')
              : t('share', { recipientCount: recipients.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

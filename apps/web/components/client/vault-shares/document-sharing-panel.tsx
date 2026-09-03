'use client';

import type { VaultDocumentView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
} from '@hms/ui';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { ShareDocumentDialog } from '#components/client/vault-shares/share-document-dialog';
import { ShareRow } from '#components/client/vault-shares/share-row';
import { useDocumentShares } from '#lib/vault-shares/use-document-shares';

type DocumentSharingPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: VaultDocumentView;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

/**
 * Who one document is shared with, and the ability to take any of it back
 * (FR-E3-16, US-E3-06).
 *
 * Per document rather than a vault-wide sharing screen, deliberately. A key
 * is to one thing and one person; a screen that listed "everyone with access
 * to my vault" would imply an access level that does not exist, and would
 * make the natural next feature a way to grant one.
 */
export function DocumentSharingPanel({
  open,
  onOpenChange,
  document,
  onResult,
  onError,
}: DocumentSharingPanelProps) {
  const t = useTranslations('vault.sharing.panel');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const sharesQuery = useDocumentShares(document.id, open);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description', { title: document.title })}</DialogDescription>
          </DialogHeader>
          {sharesQuery.isPending ? (
            <p className="py-4 text-sm text-slate-500">{t('loading')}</p>
          ) : sharesQuery.isError ? (
            <p className="py-4 text-sm text-red-700">{t('error')}</p>
          ) : sharesQuery.shares.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">{t('empty')}</p>
          ) : (
            <ul className="rounded-lg border border-slate-200">
              {sharesQuery.shares.map((share) => (
                <ShareRow
                  key={share.id}
                  documentId={document.id}
                  share={share}
                  onResult={onResult}
                  onError={onError}
                />
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('close')}
            </Button>
            <Button type="button" onClick={() => setIsShareOpen(true)}>
              <Icon name="person_add" size={18} />
              {t('shareWithSomeone')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ShareDocumentDialog
        open={isShareOpen}
        onOpenChange={setIsShareOpen}
        documents={[document]}
        onShared={onResult}
      />
    </>
  );
}

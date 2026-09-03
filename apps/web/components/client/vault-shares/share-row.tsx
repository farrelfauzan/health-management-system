'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VaultDocumentShareView } from '@hms/shared-types';
import { Badge, Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { vaultDocumentShareControllerRevokeShareV1 } from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateShareQueries } from '#lib/vault-shares/invalidate-share-queries';
import { isStandingShare } from '#lib/vault-shares/is-standing-share';

type ShareRowProps = {
  documentId: string;
  share: VaultDocumentShareView;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

/**
 * One recipient, with when they last opened the document and how many times
 * (FR-E3-16).
 *
 * The counts are the reason this panel exists: being able to watch the door
 * is what makes people willing to open it. An owner who can see that their
 * STR was opened once, three weeks ago, by the person they meant, is an owner
 * who can share it again.
 *
 * A revoked share stays listed rather than disappearing — "I took that back"
 * is a fact the owner may want to confirm later, and a row that vanished
 * would leave them unsure whether they ever revoked it.
 */
export function ShareRow({ documentId, share, onResult, onError }: ShareRowProps) {
  const t = useTranslations('vault.sharing.row');
  const queryClient = useQueryClient();
  const isStanding = isStandingShare(share, new Date());

  const revokeMutation = useMutation({
    mutationFn: async () => {
      parseApiSuccess(
        await vaultDocumentShareControllerRevokeShareV1(documentId, share.id),
        t('errors.revoke'),
      );
    },
    onSuccess: async () => {
      await invalidateShareQueries(queryClient, documentId);
      onResult(t('success.revoke', { email: share.granteeEmail }));
    },
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('errors.revoke'))),
  });

  return (
    <li className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-medium text-slate-900">{share.granteeEmail}</p>
        <p className="text-xs text-slate-500">
          {share.openCount === 0
            ? t('neverOpened')
            : t('opened', {
                count: share.openCount,
                lastAccessedAt: (share.lastAccessedAt ?? '').slice(0, 10),
              })}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {!share.isLive ? (
            <Badge
              data-tone="neutral"
              className="rounded-full border-transparent bg-neutral-tint text-[11px] font-medium text-neutral"
            >
              {share.revokedAt === null ? t('expired') : t('revoked')}
            </Badge>
          ) : share.expiresAt === null ? (
            <Badge
              data-tone={isStanding ? 'warning' : 'neutral'}
              className={
                isStanding
                  ? 'gap-1 rounded-full border-transparent bg-warning-tint text-[11px] font-medium text-warning'
                  : 'rounded-full border-transparent bg-neutral-tint text-[11px] font-medium text-neutral'
              }
            >
              {/* FR-E3-20. A standing share is often deliberate, so this
                  surfaces it rather than nagging: the point is that a share
                  made for one afternoon is not still live a year later. */}
              {isStanding ? <Icon name="history" size={12} /> : null}
              {isStanding ? t('standing') : t('openEnded')}
            </Badge>
          ) : (
            <Badge
              data-tone="neutral"
              className="rounded-full border-transparent bg-neutral-tint text-[11px] font-medium text-neutral"
            >
              {t('until', { expiresAt: share.expiresAt.slice(0, 10) })}
            </Badge>
          )}
        </div>
      </div>
      {share.isLive ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={revokeMutation.isPending}
          onClick={() => revokeMutation.mutate()}
        >
          {t('revoke')}
        </Button>
      ) : null}
    </li>
  );
}

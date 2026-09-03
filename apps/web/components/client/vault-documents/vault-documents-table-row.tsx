'use client';

import type { VaultDocumentView } from '@hms/shared-types';
import { TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { VaultDocumentRowActions } from '#components/client/vault-documents/vault-document-row-actions';
import { VaultExpiryBadge } from '#components/client/vault-documents/vault-expiry-badge';
import { formatDocumentSize } from '#lib/patient-documents/format-document-size';
import { resolveVaultExpiryStatus } from '#lib/vault-documents/vault-expiry-status';

type VaultDocumentsTableRowProps = {
  document: VaultDocumentView;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

/**
 * One document in the owner's vault.
 *
 * The reference number sits under the title rather than in its own column:
 * "which STR is this" is answered by reading the two together, and a column
 * that is empty for a CV and an ijazah would be mostly whitespace.
 */
export function VaultDocumentsTableRow({
  document,
  onResult,
  onError,
}: VaultDocumentsTableRowProps) {
  const t = useTranslations('vault');
  const expiryStatus = resolveVaultExpiryStatus(document.expiresAt, new Date());

  return (
    <TableRow>
      <TableCell className="px-4 py-3">
        <p className="text-sm font-medium text-slate-900">{document.title}</p>
        {document.referenceNumber ? (
          <p className="font-mono text-xs text-slate-500">{document.referenceNumber}</p>
        ) : null}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {document.vaultCategory ? t(`categories.${document.vaultCategory}`) : t('categories.NONE')}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {document.issuedAt ?? t('table.notRecorded')}
      </TableCell>
      <TableCell className="px-4">
        <VaultExpiryBadge status={expiryStatus} expiresAt={document.expiresAt} />
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {formatDocumentSize(document.sizeBytes)}
      </TableCell>
      <TableCell className="px-4 text-right">
        <VaultDocumentRowActions document={document} onResult={onResult} onError={onError} />
      </TableCell>
    </TableRow>
  );
}

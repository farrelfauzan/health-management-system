'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import type { ManagedDocumentView } from '@hms/shared-types';
import { Badge, Button, Icon, TableCell, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { StatusBadge } from '#components/shared/status-badge';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { openManagedDocument } from '#lib/managed-documents/open-managed-document';

type ManagedDocumentsTableRowProps = {
  document: ManagedDocumentView;
  onError: (message: string) => void;
};

/**
 * One registry row: what it is, who it is between, where it stands. Party
 * names sit on the row (FR-E5-03) so a records officer scanning for a
 * patient's agreements never opens one to find out. Download appears only
 * on an uploaded body — a drafted document has no file, and a button the
 * API would refuse is worse than none.
 *
 * The overdue flag (`P16-T31`, FR-E5-27) sits beside the status rather than
 * replacing it, because an overdue round is still PENDING and still
 * actionable: a deadline raises attention, it never decides (FR-E5-28).
 */
export function ManagedDocumentsTableRow({ document, onError }: ManagedDocumentsTableRowProps) {
  const t = useTranslations('operations.documents.registry');
  const format = useFormatter();
  const parties = [document.patient?.fullName, document.doctor?.fullName].filter(
    (name): name is string => name !== undefined && name !== null,
  );
  const downloadMutation = useMutation({
    mutationFn: () =>
      openManagedDocument({ documentId: document.id, errorMessage: t('actions.downloadError') }),
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('actions.downloadError'))),
  });

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <Link
          href={`/admin/documents/${document.id}`}
          className="text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
        >
          {document.title}
        </Link>
        <p className="text-xs text-slate-500">
          {document.documentNumber ? `${document.documentNumber} · ` : ''}
          {document.storageKey ? t('bodyKinds.uploaded') : t('bodyKinds.drafted')}
        </p>
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{document.type.name}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {parties.length === 0 ? t('noParties') : parties.join(' · ')}
      </TableCell>
      <TableCell className="px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={document.status} label={t(`statuses.${document.status}`)} />
          {document.approval?.isOverdue ? (
            <Badge variant="destructive">{t('overdue')}</Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{document.draftedBy.email}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {format.dateTime(new Date(document.createdAt), { dateStyle: 'medium' })}
      </TableCell>
      <TableCell className="px-4 text-right">
        {document.storageKey ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('actions.download')}
            title={t('actions.download')}
            disabled={downloadMutation.isPending}
            onClick={() => downloadMutation.mutate()}
          >
            <Icon name="download" size={18} className="text-slate-600" />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

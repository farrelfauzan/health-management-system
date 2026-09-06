'use client';

import Link from 'next/link';
import type { DocumentApprovalQueueItemView } from '@hms/shared-types';
import { Badge, TableCell, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

type DocumentApprovalQueueRowProps = {
  item: DocumentApprovalQueueItemView;
};

/**
 * One waiting decision: what it is, who wrote it, when it is due and how
 * long it has been sitting (US-E5-02).
 *
 * The row links into the workspace rather than carrying approve and reject
 * buttons of its own: a decision is made against the frozen submission
 * (FR-E5-21), and approving from a list would be approving a title.
 */
export function DocumentApprovalQueueRow({ item }: DocumentApprovalQueueRowProps) {
  const t = useTranslations('operations.documents.approvals.queue');
  const format = useFormatter();

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <Link
          href={`/admin/documents/${item.document.id}`}
          className="text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
        >
          {item.document.title}
        </Link>
        {item.document.documentNumber === null ? null : (
          <p className="text-xs text-slate-500">{item.document.documentNumber}</p>
        )}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{item.document.type.name}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{item.round.submittedBy.email}</TableCell>
      <TableCell className="px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-slate-600">
            {item.round.dueAt === null
              ? t('noDueDate')
              : format.dateTime(new Date(item.round.dueAt), { dateStyle: 'medium' })}
          </span>
          {item.round.isOverdue ? <Badge variant="destructive">{t('overdue')}</Badge> : null}
        </div>
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {format.relativeTime(new Date(item.round.submittedAt))}
      </TableCell>
    </TableRow>
  );
}

'use client';

import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent, Checkbox, Label, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { BulkApproveButton } from '#components/client/document-approvals/bulk-approve-button';
import { DocumentApprovalQueueTable } from '#components/client/document-approvals/document-approval-queue-table';
import { EmptyState } from '#components/shared/empty-state';
import { useDocumentApprovalQueue } from '#lib/document-approvals/use-document-approval-queue';

const PAGE_LIMIT = 50;

/**
 * Everything waiting on the viewer, in one list (`P16-T31`, US-E5-02).
 *
 * The whole tab is absent for someone without `document-approval.decide:any`
 * — a queue of decisions they cannot make is noise, and the API would refuse
 * every row of it anyway.
 */
export function DocumentApprovalQueuePanel() {
  const t = useTranslations('operations.documents.approvals.queue');
  const ability = useAbility();
  const canDecide = ability.can('decide', 'DocumentApproval');
  const [isOverdueOnly, setIsOverdueOnly] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const queue = useDocumentApprovalQueue(
    {
      assignedToMe: 'true',
      page: 1,
      limit: PAGE_LIMIT,
      ...(isOverdueOnly ? { overdueOnly: 'true' } : {}),
    },
    canDecide,
  );

  const toggleSelected = useCallback((roundId: string, isSelected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (isSelected) {
        next.add(roundId);
      } else {
        next.delete(roundId);
      }
      return next;
    });
  }, []);
  // Only the rounds still on screen. A selection that survived a filter
  // change would let an approver approve rows they can no longer see.
  const selectedRequestIds = useMemo(
    () => queue.approvals.filter((item) => selectedIds.has(item.round.id)).map((item) => item.round.id),
    [queue.approvals, selectedIds],
  );

  if (!canDecide) {
    return (
      <EmptyState
        icon="how_to_reg"
        title={t('notAnApprover')}
        description={t('notAnApproverDescription')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t('description')}</p>
        <div className="flex items-center gap-2">
          {selectedRequestIds.length === 0 ? null : (
            <BulkApproveButton
              requestIds={selectedRequestIds}
              onDone={() => setSelectedIds(new Set())}
            />
          )}
          <Checkbox
            id="document-approvals-overdue-only"
            checked={isOverdueOnly}
            onCheckedChange={(checked) => setIsOverdueOnly(checked === true)}
          />
          <Label htmlFor="document-approvals-overdue-only" className="text-sm text-slate-600">
            {t('overdueOnly')}
          </Label>
        </div>
      </div>
      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <DocumentApprovalQueueTable
            items={queue.approvals}
            isPending={queue.isPending}
            isError={queue.isError}
            selectedIds={selectedIds}
            onSelectedChange={toggleSelected}
          />
        </CardContent>
      </Card>
    </div>
  );
}

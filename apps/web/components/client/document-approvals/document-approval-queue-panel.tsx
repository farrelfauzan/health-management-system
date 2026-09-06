'use client';

import { useState } from 'react';
import { Card, CardContent, Checkbox, Label, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

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
  const queue = useDocumentApprovalQueue(
    {
      assignedToMe: 'true',
      page: 1,
      limit: PAGE_LIMIT,
      ...(isOverdueOnly ? { overdueOnly: 'true' } : {}),
    },
    canDecide,
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
          />
        </CardContent>
      </Card>
    </div>
  );
}

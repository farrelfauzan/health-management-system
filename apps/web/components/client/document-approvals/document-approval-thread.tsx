'use client';

import type { DocumentApprovalRoundView } from '@hms/shared-types';
import { Card, CardContent } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DocumentApprovalRoundItem } from '#components/client/document-approvals/document-approval-round-item';

type DocumentApprovalThreadProps = {
  rounds: DocumentApprovalRoundView[];
  isPending: boolean;
};

/**
 * Every round this document has been through, newest first (FR-E5-05).
 *
 * The thread is the half a drafter comes back for: a rejection keeps its
 * reason here forever, and a superseded round records that the artefact
 * changed under a panel rather than quietly disappearing.
 */
export function DocumentApprovalThread({ rounds, isPending }: DocumentApprovalThreadProps) {
  const t = useTranslations('operations.documents.approvals.thread');

  if (isPending) {
    return <p className="px-4 py-6 text-sm text-slate-500">{t('loading')}</p>;
  }
  if (rounds.length === 0) {
    return <p className="px-4 py-6 text-sm text-slate-500">{t('empty')}</p>;
  }

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardContent className="space-y-4 p-4">
        {rounds.map((round) => (
          <DocumentApprovalRoundItem key={round.id} round={round} />
        ))}
      </CardContent>
    </Card>
  );
}

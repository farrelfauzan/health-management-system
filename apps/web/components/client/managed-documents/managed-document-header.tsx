'use client';

import type { ManagedDocumentDetailView } from '@hms/shared-types';
import { Card, CardContent } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { StatusBadge } from '#components/shared/status-badge';

type ManagedDocumentHeaderProps = {
  document: ManagedDocumentDetailView;
};

/** Parties, status and timestamps — the facts a reader checks before the body. */
export function ManagedDocumentHeader({ document }: ManagedDocumentHeaderProps) {
  const t = useTranslations('operations.documents.workspace');
  const registry = useTranslations('operations.documents.registry');
  const format = useFormatter();
  const parties = [document.patient?.fullName, document.doctor?.fullName].filter(
    (name): name is string => name !== undefined && name !== null,
  );

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <p className="text-xs text-slate-500">{registry('columns.status')}</p>
          <StatusBadge
            status={document.status}
            label={registry(`statuses.${document.status}`)}
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500">{registry('columns.parties')}</p>
          <p className="text-sm text-slate-900">
            {parties.length === 0 ? registry('noParties') : parties.join(' · ')}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500">{registry('columns.draftedBy')}</p>
          <p className="text-sm text-slate-900">{document.draftedBy.email}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500">{t('issuedAt')}</p>
          <p className="text-sm text-slate-900">
            {document.issuedAt === null
              ? t('notIssued')
              : format.dateTime(new Date(document.issuedAt), { dateStyle: 'medium' })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

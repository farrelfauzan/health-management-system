'use client';

import { useMutation } from '@tanstack/react-query';
import type { PortalDocumentView } from '@hms/shared-types';
import { Button, Icon } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { openPatientDocument } from '#lib/patient-documents/open-patient-document';

type PortalDocumentRowProps = {
  document: PortalDocumentView;
  onError: (message: string) => void;
};

/**
 * One released document as the patient sees it.
 *
 * The fields are exactly what `PortalDocumentView` carries — no staff notes,
 * no uploader, no internal ids — because the narrowing happens on the server
 * and this component has nothing else to render even if it wanted to.
 *
 * "Released" is shown as a date, not a badge. On the staff side the badge
 * answers "will the patient see this"; here the patient is already seeing it,
 * and the useful fact is *when the clinic shared it* — which is what tells
 * someone whether the result they were waiting for has arrived.
 */
export function PortalDocumentRow({ document, onError }: PortalDocumentRowProps) {
  const t = useTranslations('clinical.portal.documents');
  const format = useFormatter();

  const downloadMutation = useMutation({
    mutationFn: () =>
      openPatientDocument({ documentId: document.id, errorMessage: t('downloadError') }),
    onError: () => onError(t('downloadError')),
  });

  function formatDay(value: string | null): string {
    if (value === null) {
      return t('noDate');
    }
    const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime()) ? value : format.dateTime(date, { dateStyle: 'medium' });
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900">{document.title}</p>
        <p className="truncate text-sm text-slate-500">
          {t(`categories.${document.category}`)}
          {' · '}
          {formatDay(document.documentDate)}
        </p>
        <p className="text-xs text-slate-400">
          {t('sharedOn', { date: formatDay(document.releasedAt) })}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={downloadMutation.isPending}
        onClick={() => downloadMutation.mutate()}
      >
        <Icon name="download" size={18} />
        {t('download')}
      </Button>
    </li>
  );
}

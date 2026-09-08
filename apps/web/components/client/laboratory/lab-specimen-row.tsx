'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LabSpecimenView } from '@hms/shared-types';
import { Badge, Button, TableCell, TableRow, toast } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { LabPrintLabelsButton } from '#components/client/laboratory/lab-print-labels-button';
import { labSpecimenControllerReceiveLabSpecimenV1 } from '#lib/api/generated/laboratory-specimens/laboratory-specimens';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateLabQueries } from '#lib/laboratory/invalidate-lab-queries';

const STATUS_CLASSNAMES: Record<LabSpecimenView['status'], string> = {
  COLLECTED: 'bg-slate-100 text-slate-700',
  RECEIVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
};

type LabSpecimenRowProps = {
  specimen: LabSpecimenView;
  canWrite: boolean;
  onReject: (specimen: LabSpecimenView) => void;
};

/** One tube: its number, where it is, and the two things the bench does to it. */
export function LabSpecimenRow({ specimen, canWrite, onReject }: LabSpecimenRowProps) {
  const t = useTranslations('operations.laboratory.specimens');
  const tCatalog = useTranslations('operations.laboratory');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const receiveMutation = useMutation({
    mutationFn: () => labSpecimenControllerReceiveLabSpecimenV1(specimen.id),
  });

  async function handleReceive(): Promise<void> {
    try {
      parseApiSuccess<LabSpecimenView>(await receiveMutation.mutateAsync(), t('receiveError'));
      toast.success(t('received'));
      await invalidateLabQueries(queryClient);
    } catch (caughtError) {
      notifyApiError(caughtError, t('receiveError'));
    }
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{specimen.accessionNumber}</TableCell>
      <TableCell>{tCatalog(`specimenTypes.${specimen.specimenType}`)}</TableCell>
      <TableCell className="text-sm">
        {format.dateTime(new Date(specimen.collectedAt), { dateStyle: 'medium', timeStyle: 'short' })}
      </TableCell>
      <TableCell className="text-sm">
        {specimen.receivedAt
          ? format.dateTime(new Date(specimen.receivedAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : '—'}
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className={STATUS_CLASSNAMES[specimen.status]}>
          {t(`statuses.${specimen.status}`)}
        </Badge>
        {specimen.rejectReason ? (
          <p className="mt-1 text-xs text-slate-500">
            {t('rejectedWith', { reason: t(`reasons.${specimen.rejectReason}`) })}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          {specimen.status !== 'REJECTED' ? (
            <LabPrintLabelsButton specimenIds={[specimen.id]} variant="ghost" />
          ) : null}
          {canWrite && specimen.status === 'COLLECTED' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleReceive}
              disabled={receiveMutation.isPending}
            >
              {receiveMutation.isPending ? t('receiving') : t('receive')}
            </Button>
          ) : null}
          {canWrite && specimen.status !== 'REJECTED' ? (
            <Button type="button" size="sm" variant="destructive" onClick={() => onReject(specimen)}>
              {t('reject')}
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

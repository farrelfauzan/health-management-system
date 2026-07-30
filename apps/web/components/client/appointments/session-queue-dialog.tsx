'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { SessionQueueTable } from '#components/client/appointments/session-queue-table';
import { useSessionQueue } from '#lib/appointments/use-session-queue';

type SessionQueueDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
};

function formatSessionCapacity(bookedCount: number, maxPatients: number | null): string {
  return maxPatients === null
    ? `${bookedCount} booked · unlimited`
    : `${bookedCount}/${maxPatients} booked`;
}

export function SessionQueueDialog({ open, onOpenChange, sessionId }: SessionQueueDialogProps) {
  const t = useTranslations('operations.appointments');
  const queueQuery = useSessionQueue(sessionId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('labels.sessionQueue')}</DialogTitle>
          <DialogDescription>
            {queueQuery.session
              ? `${queueQuery.session.sessionDate} · ${queueQuery.session.startTime}–${queueQuery.session.endTime} · ${formatSessionCapacity(queueQuery.session.bookedCount, queueQuery.session.maxPatients)}`
              : t('loadingSession')}
          </DialogDescription>
        </DialogHeader>
        {queueQuery.isPending ? (
          <p className="text-sm text-slate-500">{t('loadingQueue')}</p>
        ) : queueQuery.isError ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            Failed to load the session queue.
          </p>
        ) : queueQuery.queue.length === 0 ? (
          <p className="text-sm text-slate-500">{t('noSessionPatients')}</p>
        ) : (
          <SessionQueueTable queue={queueQuery.queue} />
        )}
        <p className="text-xs text-slate-500">
          Queue numbers are assigned at check-in, first come first served. Patients without a number
          have not arrived yet.
        </p>
      </DialogContent>
    </Dialog>
  );
}

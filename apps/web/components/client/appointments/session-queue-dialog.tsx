'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hms/ui';

import { StatusBadge } from '#components/shared/status-badge';
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
  const queueQuery = useSessionQueue(sessionId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Session Queue</DialogTitle>
          <DialogDescription>
            {queueQuery.session
              ? `${queueQuery.session.sessionDate} · ${queueQuery.session.startTime}–${queueQuery.session.endTime} · ${formatSessionCapacity(queueQuery.session.bookedCount, queueQuery.session.maxPatients)}`
              : 'Loading session…'}
          </DialogDescription>
        </DialogHeader>
        {queueQuery.isPending ? (
          <p className="text-sm text-slate-500">Loading queue…</p>
        ) : queueQuery.isError ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            Failed to load the session queue.
          </p>
        ) : queueQuery.queue.length === 0 ? (
          <p className="text-sm text-slate-500">No patients booked into this session yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Queue</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queueQuery.queue.map((entry) => (
                <TableRow key={entry.appointmentId}>
                  <TableCell className="font-mono text-sm">
                    {entry.queueNumber ?? '—'}
                  </TableCell>
                  <TableCell>
                    <span className="block text-sm font-medium text-slate-900">
                      {entry.patient.fullName}
                    </span>
                    <span className="block font-mono text-xs text-slate-500">
                      {entry.patient.mrn}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={entry.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-slate-500">
          Queue numbers are assigned at check-in, first come first served. Patients without a number
          have not arrived yet.
        </p>
      </DialogContent>
    </Dialog>
  );
}

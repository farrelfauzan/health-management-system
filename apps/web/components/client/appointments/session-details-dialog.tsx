'use client';

import type { DoctorSessionCalendarItem } from '@hms/shared-types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@hms/ui';

import { SessionQueueTable } from '#components/client/appointments/session-queue-table';
import { useSessionQueue } from '#lib/appointments/use-session-queue';

type SessionDetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: DoctorSessionCalendarItem;
  onSelectAppointment?: (appointmentId: string) => void;
};

function formatCapacitySummary(session: DoctorSessionCalendarItem): string {
  if (session.maxPatients === null) {
    return `${session.bookedCount} patients booked · unlimited capacity`;
  }
  return `${session.bookedCount} of ${session.maxPatients} patients booked`;
}

export function SessionDetailsDialog({
  open,
  onOpenChange,
  session,
  onSelectAppointment,
}: SessionDetailsDialogProps) {
  const queueQuery = useSessionQueue(session.id ?? '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {session.doctor.fullName} — Practice Session
          </DialogTitle>
          <DialogDescription>
            {session.doctor.specialty} · {session.sessionDate} · {session.startTime}–
            {session.endTime}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
            <span className="text-sm text-slate-900">{formatCapacitySummary(session)}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">
              {session.status.toLowerCase()}
            </span>
          </div>
          {session.id === null || session.bookedCount === 0 ? (
            <p className="text-sm text-slate-500">No patients booked into this session yet.</p>
          ) : queueQuery.isPending ? (
            <p className="text-sm text-slate-500">Loading patients…</p>
          ) : queueQuery.isError ? (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              Failed to load the session patients.
            </p>
          ) : (
            <SessionQueueTable
              queue={queueQuery.queue}
              onSelectEntry={
                onSelectAppointment
                  ? (entry) => onSelectAppointment(entry.appointmentId)
                  : undefined
              }
            />
          )}
          <p className="text-xs text-slate-500">
            Queue numbers are assigned at check-in, first come first served. Patients without a
            number have not arrived yet.
            {onSelectAppointment ? ' Click a patient to open their appointment.' : ''}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

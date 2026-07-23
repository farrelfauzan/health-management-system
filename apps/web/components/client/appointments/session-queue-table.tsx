'use client';

import type { SessionQueueEntry } from '@hms/shared-types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hms/ui';

import { StatusBadge } from '#components/shared/status-badge';

type SessionQueueTableProps = {
  queue: SessionQueueEntry[];
};

export function SessionQueueTable({ queue }: SessionQueueTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Queue</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {queue.map((entry) => (
          <TableRow key={entry.appointmentId}>
            <TableCell className="font-mono text-sm">{entry.queueNumber ?? '—'}</TableCell>
            <TableCell>
              <span className="block text-sm font-medium text-slate-900">
                {entry.patient.fullName}
              </span>
              <span className="block font-mono text-xs text-slate-500">{entry.patient.mrn}</span>
            </TableCell>
            <TableCell>
              <StatusBadge status={entry.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

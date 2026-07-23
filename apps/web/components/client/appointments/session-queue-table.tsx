'use client';

import type { SessionQueueEntry } from '@hms/shared-types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@hms/ui';

import { StatusBadge } from '#components/shared/status-badge';

type SessionQueueTableProps = {
  queue: SessionQueueEntry[];
  onSelectEntry?: (entry: SessionQueueEntry) => void;
};

export function SessionQueueTable({ queue, onSelectEntry }: SessionQueueTableProps) {
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
          <TableRow
            key={entry.appointmentId}
            className={cn(onSelectEntry && 'cursor-pointer hover:bg-slate-50')}
            {...(onSelectEntry
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': `View appointment for ${entry.patient.fullName}`,
                  onClick: () => onSelectEntry(entry),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectEntry(entry);
                    }
                  },
                }
              : {})}
          >
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

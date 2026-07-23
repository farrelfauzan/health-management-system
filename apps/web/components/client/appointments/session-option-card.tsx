'use client';

import type { DoctorSessionListItem } from '@hms/shared-types';
import { cn } from '@hms/ui';

type SessionOptionCardProps = {
  session: DoctorSessionListItem;
  isSelected: boolean;
  onSelect: (session: DoctorSessionListItem) => void;
};

function formatCapacityLabel(session: DoctorSessionListItem): string {
  if (session.maxPatients === null) {
    return `${session.bookedCount} booked · unlimited`;
  }
  return `${session.bookedCount}/${session.maxPatients} booked`;
}

export function SessionOptionCard({ session, isSelected, onSelect }: SessionOptionCardProps) {
  const isFull = session.remaining !== null && session.remaining <= 0;
  const isBookable = session.status === 'OPEN' && !isFull;
  const statusLabel = session.status !== 'OPEN' ? session.status.toLowerCase() : isFull ? 'full' : null;

  return (
    <button
      type="button"
      disabled={!isBookable}
      aria-pressed={isSelected}
      onClick={() => onSelect(session)}
      className={cn(
        'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
        isSelected
          ? 'border-primary bg-info-tint text-primary'
          : 'border-slate-200 text-slate-900 hover:border-slate-300',
        !isBookable && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className="font-medium">
        {session.startTime}–{session.endTime}
      </span>
      <span className="text-xs text-slate-500">
        {formatCapacityLabel(session)}
        {statusLabel ? ` · ${statusLabel}` : ''}
      </span>
    </button>
  );
}

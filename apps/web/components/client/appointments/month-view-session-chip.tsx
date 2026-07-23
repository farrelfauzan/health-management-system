'use client';

import type { DoctorSessionCalendarItem } from '@hms/shared-types';
import { cn } from '@hms/ui';

type MonthViewSessionChipProps = {
  session: DoctorSessionCalendarItem;
  onSelect: (session: DoctorSessionCalendarItem) => void;
};

export function MonthViewSessionChip({ session, onSelect }: MonthViewSessionChipProps) {
  const isCancelled = session.status === 'CANCELLED';
  return (
    <button
      type="button"
      onClick={() => onSelect(session)}
      className={cn(
        'flex w-full items-center gap-1 truncate rounded border-l-2 px-1 py-0.5 text-left text-[10px] transition-colors',
        isCancelled
          ? 'border-danger bg-danger-tint/60 text-danger hover:bg-danger-tint'
          : 'border-primary bg-info-tint text-primary hover:bg-info-tint/70',
      )}
    >
      <span className="truncate font-medium">{session.doctor.fullName}</span>
      <span className="ml-auto shrink-0 font-semibold">{session.bookedCount}</span>
    </button>
  );
}

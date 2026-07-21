import { Icon } from '@hms/ui';

type CurrentDateChipProps = {
  date: Date;
};

export function CurrentDateChip({ date }: CurrentDateChipProps) {
  const dateLabel = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return (
    <span className="flex h-9 items-center gap-2 rounded-lg bg-info-tint px-3 font-heading text-sm font-medium text-primary">
      <Icon name="calendar_today" size={18} />
      {dateLabel}
    </span>
  );
}

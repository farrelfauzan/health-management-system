import { Icon } from '@hms/ui';
import { getFormatter } from 'next-intl/server';

type CurrentDateChipProps = {
  date: Date;
};

export async function CurrentDateChip({ date }: CurrentDateChipProps) {
  const format = await getFormatter();
  const dateLabel = format.dateTime(date, {
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

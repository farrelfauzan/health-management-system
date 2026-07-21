import { cn } from '@hms/ui';

import { TimelineItem, type TimelineEntry } from '#components/shared/timeline-item';

type TimelineListProps = {
  entries: TimelineEntry[];
  className?: string;
};

export function TimelineList({ entries, className }: TimelineListProps) {
  return (
    <ol className={cn('list-none', className)}>
      {entries.map((entry, index) => (
        <TimelineItem key={entry.id} entry={entry} isLast={index === entries.length - 1} />
      ))}
    </ol>
  );
}

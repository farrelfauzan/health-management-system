export type TimelineEntry = {
  id: string;
  time: string;
  title: string;
  description?: string;
};

type TimelineItemProps = {
  entry: TimelineEntry;
  isLast: boolean;
};

export function TimelineItem({ entry, isLast }: TimelineItemProps) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <div className="flex flex-col items-center">
        <span className="mt-1 size-2 shrink-0 rounded-full bg-primary-container" />
        {!isLast ? <span className="mt-1 w-px flex-1 bg-slate-200" /> : null}
      </div>
      <div className="space-y-0.5">
        <p className="text-xs text-slate-400">{entry.time}</p>
        <p className="text-sm font-medium text-slate-900">{entry.title}</p>
        {entry.description ? <p className="text-xs text-slate-500">{entry.description}</p> : null}
      </div>
    </li>
  );
}

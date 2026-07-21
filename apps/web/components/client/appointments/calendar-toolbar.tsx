'use client';

import { Button, Icon, cn } from '@hms/ui';

import type { AppointmentsView } from '#lib/appointments/search-params';

type ViewOption = {
  key: AppointmentsView;
  label: string;
};

const VIEW_OPTIONS: ViewOption[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'table', label: 'Table' },
];

const NAVIGATION_UNIT_BY_VIEW: Record<AppointmentsView, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  table: 'week',
};

type CalendarToolbarProps = {
  title: string;
  view: AppointmentsView;
  onNavigatePrevious: () => void;
  onNavigateToday: () => void;
  onNavigateNext: () => void;
  onViewChange: (view: AppointmentsView) => void;
  onPrint: () => void;
};

export function CalendarToolbar({
  title,
  view,
  onNavigatePrevious,
  onNavigateToday,
  onNavigateNext,
  onViewChange,
  onPrint,
}: CalendarToolbarProps) {
  const navigationUnit = NAVIGATION_UNIT_BY_VIEW[view];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <div className="flex items-center gap-3">
        <h2 className="font-heading text-lg font-semibold text-slate-900">{title}</h2>
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            aria-label={`Previous ${navigationUnit}`}
            className="flex size-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-white"
            onClick={onNavigatePrevious}
          >
            <Icon name="chevron_left" size={18} />
          </button>
          <button
            type="button"
            className="flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-white"
            onClick={onNavigateToday}
          >
            Today
          </button>
          <button
            type="button"
            aria-label={`Next ${navigationUnit}`}
            className="flex size-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-white"
            onClick={onNavigateNext}
          >
            <Icon name="chevron_right" size={18} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg bg-slate-100 p-1">
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                option.key === view
                  ? 'bg-white font-semibold text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:bg-white',
              )}
              onClick={() => onViewChange(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" size="icon" aria-label="Print schedule" onClick={onPrint}>
          <Icon name="print" size={18} className="text-slate-600" />
        </Button>
      </div>
    </div>
  );
}

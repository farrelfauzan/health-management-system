const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function formatDayOfWeekLabel(dayOfWeek: number): string {
  return DAY_LABELS[dayOfWeek] ?? String(dayOfWeek);
}

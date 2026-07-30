const DAYS_PER_WEEK = 7;
const MONDAY_INDEX = 1;

export function formatDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateParam(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(parsed.getTime()) || formatDateParam(parsed) !== value) {
    return null;
  }
  return parsed;
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function getWeekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (start.getDay() - MONDAY_INDEX + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return addDays(start, -offset);
}

export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: DAYS_PER_WEEK }, (_, index) => addDays(weekStart, index));
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addMonths(date: Date, amount: number): Date {
  const targetMonthStart = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const daysInTargetMonth = new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth() + 1,
    0,
  ).getDate();
  return new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth(),
    Math.min(date.getDate(), daysInTargetMonth),
  );
}

export function getMonthGridStart(date: Date): Date {
  return getWeekStart(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function getMonthGridDays(date: Date): Date[] {
  const gridStart = getMonthGridStart(date);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const totalDays = Math.round((monthEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1;
  const gridLength = Math.ceil(totalDays / DAYS_PER_WEEK) * DAYS_PER_WEEK;
  return Array.from({ length: gridLength }, (_, index) => addDays(gridStart, index));
}

export function formatDayTitle(date: Date, locale = 'id-ID'): string {
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatMonthTitle(date: Date, locale = 'id-ID'): string {
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export function formatWeekRangeTitle(weekStart: Date, locale = 'id-ID'): string {
  const weekEnd = addDays(weekStart, DAYS_PER_WEEK - 1);
  const startMonth = weekStart.toLocaleDateString(locale, { month: 'long' });
  const endMonth = weekEnd.toLocaleDateString(locale, { month: 'long' });
  if (weekStart.getFullYear() !== weekEnd.getFullYear()) {
    return `${startMonth} ${weekStart.getDate()}, ${weekStart.getFullYear()} – ${endMonth} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
  }
  if (weekStart.getMonth() !== weekEnd.getMonth()) {
    return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
  }
  return `${startMonth} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
}

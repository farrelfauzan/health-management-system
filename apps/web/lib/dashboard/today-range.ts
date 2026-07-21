export type TodayRange = {
  from: string;
  to: string;
};

export function getTodayRange(now: Date): TodayRange {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  return {
    from: startOfDay.toISOString(),
    to: endOfDay.toISOString(),
  };
}

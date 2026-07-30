export type DashboardGreetingParams = {
  displayName: string;
  facilityName: string;
  date: Date;
};

export type DashboardDayPart = 'morning' | 'afternoon' | 'evening';

export function resolveDashboardDayPart(hour: number): DashboardDayPart {
  if (hour < 12) {
    return 'morning';
  }
  if (hour < 18) {
    return 'afternoon';
  }
  return 'evening';
}

export type DashboardGreetingParams = {
  displayName: string;
  facilityName: string;
  date: Date;
};

function resolveDayPartLabel(hour: number): string {
  if (hour < 12) {
    return 'morning';
  }
  if (hour < 18) {
    return 'afternoon';
  }
  return 'evening';
}

export function buildDashboardGreeting({
  displayName,
  facilityName,
  date,
}: DashboardGreetingParams): string {
  const dayPartLabel = resolveDayPartLabel(date.getHours());
  return `Good ${dayPartLabel}, ${displayName}. Here's what's happening today at ${facilityName}.`;
}

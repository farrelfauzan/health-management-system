import { DashboardStatCards } from '#components/client/dashboard/dashboard-stat-cards';
import { DashboardVisitsTodayCard } from '#components/client/dashboard/dashboard-visits-today-card';
import { UpcomingAppointmentsCard } from '#components/client/dashboard/upcoming-appointments-card';
import { DashboardHeader } from '#components/server/dashboard/dashboard-header';
import { QuickActionsCard } from '#components/server/dashboard/quick-actions-card';
import { resolveAnalyticsAccess } from '#lib/analytics/resolve-analytics-access.server';

export default async function AdminDashboardPage() {
  // P29-T16. The visits card reads the operations figures, so it shows only
  // where the operations dashboard itself would open.
  const access = await resolveAnalyticsAccess();
  const canSeeVisitsToday = access.isEnabled && access.ability.can('read-operations', 'Analytics');
  return (
    <div className="space-y-6">
      <DashboardHeader />
      <DashboardStatCards />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <UpcomingAppointmentsCard />
        <div className="space-y-6">
          <QuickActionsCard />
          {canSeeVisitsToday ? <DashboardVisitsTodayCard /> : null}
        </div>
      </div>
    </div>
  );
}

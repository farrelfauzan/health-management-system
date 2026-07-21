import { DashboardStatCards } from '#components/client/dashboard/dashboard-stat-cards';
import { UpcomingAppointmentsCard } from '#components/client/dashboard/upcoming-appointments-card';
import { DashboardHeader } from '#components/server/dashboard/dashboard-header';
import { QuickActionsCard } from '#components/server/dashboard/quick-actions-card';
import { RecentActivityCard } from '#components/server/dashboard/recent-activity-card';

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <DashboardHeader />
      <DashboardStatCards />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <UpcomingAppointmentsCard />
        <div className="space-y-6">
          <QuickActionsCard />
          <RecentActivityCard />
        </div>
      </div>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';

import { QuickActionItem } from '#components/server/dashboard/quick-action-item';

export function QuickActionsCard() {
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center gap-2">
        <span className="text-primary">
          <Icon name="bolt" size={20} />
        </span>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <QuickActionItem
          icon="person_add"
          title="Register Patient"
          description="Add new patient to the system"
          href="/admin/registrations?new=1"
        />
        <QuickActionItem
          icon="edit_calendar"
          title="Schedule Appointment"
          description="Find an open slot for a doctor"
          href="/admin/appointments"
        />
        <QuickActionItem
          icon="lab_profile"
          title="Generate Report"
          description="Daily clinical performance data"
          disabledReason="Reporting ships in a later phase."
        />
      </CardContent>
    </Card>
  );
}

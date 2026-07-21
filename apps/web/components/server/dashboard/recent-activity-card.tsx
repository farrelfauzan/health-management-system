import { Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';

import { TimelineList } from '#components/shared/timeline-list';
import { MOCK_RECENT_ACTIVITY } from '#lib/dashboard/mock-activity';

export function RecentActivityCard() {
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center gap-2">
        <span className="text-primary">
          <Icon name="history" size={20} />
        </span>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TimelineList entries={MOCK_RECENT_ACTIVITY} />
      </CardContent>
    </Card>
  );
}

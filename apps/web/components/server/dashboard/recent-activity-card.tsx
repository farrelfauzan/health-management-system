import { Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';
import { getFormatter, getTranslations } from 'next-intl/server';

import { TimelineList } from '#components/shared/timeline-list';
import { buildMockRecentActivity } from '#lib/dashboard/mock-activity';

export async function RecentActivityCard() {
  const t = await getTranslations('dashboard.activity');
  const format = await getFormatter();
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center gap-2">
        <span className="text-primary">
          <Icon name="history" size={20} />
        </span>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TimelineList entries={buildMockRecentActivity(t, format)} />
      </CardContent>
    </Card>
  );
}

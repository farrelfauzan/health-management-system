import { Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';
import { getTranslations } from 'next-intl/server';

import { QuickActionItem } from '#components/server/dashboard/quick-action-item';

export async function QuickActionsCard() {
  const t = await getTranslations('dashboard.quickActions');
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center gap-2">
        <span className="text-primary">
          <Icon name="bolt" size={20} />
        </span>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <QuickActionItem
          icon="person_add"
          title={t('registerPatient')}
          description={t('registerPatientDescription')}
          href="/admin/registrations?new=1"
        />
        <QuickActionItem
          icon="edit_calendar"
          title={t('scheduleAppointment')}
          description={t('scheduleAppointmentDescription')}
          href="/admin/appointments"
        />
        <QuickActionItem
          icon="lab_profile"
          title={t('generateReport')}
          description={t('generateReportDescription')}
          disabledReason={t('reportUnavailable')}
        />
      </CardContent>
    </Card>
  );
}

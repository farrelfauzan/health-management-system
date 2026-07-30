// DUMMY-DATA: the backend has no audit/activity feed contract yet. When an
// activity endpoint lands (paginated event list scoped by permission), replace
// this module with generated hooks and delete the static entries below.
import type { TimelineEntry } from '#components/shared/timeline-item';
import type { getFormatter, getTranslations } from 'next-intl/server';

type ActivityTranslator = Awaited<ReturnType<typeof getTranslations<'dashboard.activity'>>>;
type Formatter = Awaited<ReturnType<typeof getFormatter>>;

export function buildMockRecentActivity(t: ActivityTranslator, format: Formatter): TimelineEntry[] {
  const today = new Date();
  const atTime = (hours: number, minutes: number) =>
    format.dateTime(
      new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes),
      {
        hour: '2-digit',
        minute: '2-digit',
      },
    );
  return [
    {
      id: 'activity-emergency-admission',
      time: atTime(9, 12),
      title: t('emergencyAdmission'),
      description: t('emergencyAdmissionDescription'),
    },
    {
      id: 'activity-prescription-verified',
      time: atTime(8, 45),
      title: t('prescriptionVerified'),
      description: t('prescriptionVerifiedDescription'),
    },
    {
      id: 'activity-shift-handover',
      time: atTime(8, 0),
      title: t('shiftHandover'),
      description: t('shiftHandoverDescription'),
    },
  ];
}

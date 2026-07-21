// DUMMY-DATA: the backend has no audit/activity feed contract yet. When an
// activity endpoint lands (paginated event list scoped by permission), replace
// this module with generated hooks and delete the static entries below.
import type { TimelineEntry } from '#components/shared/timeline-item';

export const MOCK_RECENT_ACTIVITY: TimelineEntry[] = [
  {
    id: 'activity-emergency-admission',
    time: '09:12 AM',
    title: 'Emergency admission',
    description: 'Patient Sarah Connor (Cardiac Unit)',
  },
  {
    id: 'activity-prescription-verified',
    time: '08:45 AM',
    title: 'Prescription verified',
    description: 'Pharmacy released order #RX-772',
  },
  {
    id: 'activity-shift-handover',
    time: '08:00 AM',
    title: 'Shift handover complete',
    description: 'Morning shift took over operations',
  },
];

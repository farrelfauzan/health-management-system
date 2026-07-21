// DUMMY-DATA: the backend has no notifications contract yet. When a notification
// feed lands (list endpoint + unread state + mark-as-read mutation), replace this
// module with generated hooks and delete the static entries below.
export type MockNotification = {
  id: string;
  icon: string;
  title: string;
  description: string;
  timeLabel: string;
  isUnread: boolean;
};

export const MOCK_NOTIFICATIONS: MockNotification[] = [
  {
    id: 'notification-lab-results',
    icon: 'labs',
    title: 'Lab results ready',
    description: 'CBC panel for patient MRN-2041 is ready for review.',
    timeLabel: '5 min ago',
    isUnread: true,
  },
  {
    id: 'notification-appointment-checkin',
    icon: 'event_available',
    title: 'Appointment check-in',
    description: 'A 10:30 consultation patient has arrived at the front desk.',
    timeLabel: '18 min ago',
    isUnread: true,
  },
  {
    id: 'notification-low-stock',
    icon: 'local_pharmacy',
    title: 'Low stock alert',
    description: 'Amoxicillin 500mg dropped below its stock threshold.',
    timeLabel: '1 hr ago',
    isUnread: false,
  },
];

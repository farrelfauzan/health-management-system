// DUMMY-DATA: the backend has no notifications contract yet. When a notification
// feed lands (list endpoint + unread state + mark-as-read mutation), replace this
// module with generated hooks and delete the static entries below.
export type MockNotification = {
  id: string;
  icon: string;
  messageKey: 'labResults' | 'appointmentCheckin' | 'lowStock';
  isUnread: boolean;
};

export const MOCK_NOTIFICATIONS: MockNotification[] = [
  {
    id: 'notification-lab-results',
    icon: 'labs',
    messageKey: 'labResults',
    isUnread: true,
  },
  {
    id: 'notification-appointment-checkin',
    icon: 'event_available',
    messageKey: 'appointmentCheckin',
    isUnread: true,
  },
  {
    id: 'notification-low-stock',
    icon: 'local_pharmacy',
    messageKey: 'lowStock',
    isUnread: false,
  },
];

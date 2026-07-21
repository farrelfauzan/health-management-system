// DUMMY-DATA: the backend has no capacity/alerting contract yet. When an
// operational-alerts endpoint lands (severity, headline, recommendation,
// acknowledge action), replace this module with generated hooks and delete the
// static alert below.

export type ActiveAlert = {
  badge: string;
  headline: string;
  recommendation: string;
};

export const MOCK_ACTIVE_ALERT: ActiveAlert = {
  badge: 'Active Alert',
  headline: 'Emergency Room Capacity reached 95%',
  recommendation: 'Recommended: Redirect non-urgent cases to Out-Patient Wing B.',
};

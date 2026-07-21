export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const TONE_BY_STATUS: Record<string, StatusTone> = {
  confirmed: 'success',
  completed: 'success',
  active: 'success',
  'out-patient': 'success',
  scheduled: 'info',
  arrived: 'info',
  'in-progress': 'info',
  'in-patient': 'info',
  checked_in: 'info',
  pending: 'warning',
  'no-show': 'warning',
  'low-stock': 'warning',
  cancelled: 'danger',
  stat: 'danger',
  urgent: 'danger',
  regular: 'neutral',
  discharged: 'neutral',
  inactive: 'neutral',
};

export function resolveStatusTone(status: string): StatusTone {
  const normalized = status.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return TONE_BY_STATUS[normalized] ?? TONE_BY_STATUS[status.trim().toLowerCase()] ?? 'neutral';
}

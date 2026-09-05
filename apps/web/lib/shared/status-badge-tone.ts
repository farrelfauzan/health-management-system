export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const TONE_BY_STATUS: Record<string, StatusTone> = {
  confirmed: 'success',
  completed: 'success',
  active: 'success',
  'out-patient': 'success',
  dispensed: 'success',
  scheduled: 'info',
  arrived: 'info',
  issued: 'info',
  'in-progress': 'info',
  'in-patient': 'info',
  admitted: 'info',
  occupied: 'info',
  checked_in: 'info',
  pending: 'warning',
  offboarding: 'warning',
  'no-show': 'warning',
  'low-stock': 'warning',
  maintenance: 'warning',
  'partially-dispensed': 'warning',
  cancelled: 'danger',
  // Document delivery (P16-T27): waiting, out, proven, dead.
  queued: 'warning',
  sent: 'info',
  delivered: 'success',
  opened: 'success',
  failed: 'danger',
  revoked: 'danger',
  stat: 'danger',
  urgent: 'danger',
  regular: 'neutral',
  draft: 'neutral',
  discharged: 'neutral',
  inactive: 'neutral',
};

export function resolveStatusTone(status: string): StatusTone {
  const normalized = status
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  return TONE_BY_STATUS[normalized] ?? TONE_BY_STATUS[status.trim().toLowerCase()] ?? 'neutral';
}

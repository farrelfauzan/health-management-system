import { Badge, cn } from '@hms/ui';

import { resolveStatusTone, type StatusTone } from '#lib/shared/status-badge-tone';
import { formatStatusLabel } from '#lib/shared/status-label';

type StatusBadgeProps = {
  status: string;
  label?: string;
  className?: string;
};

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success-tint text-success',
  info: 'bg-info-tint text-info',
  warning: 'bg-warning-tint text-warning',
  danger: 'bg-danger-tint text-danger',
  neutral: 'bg-neutral-tint text-neutral',
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const tone = resolveStatusTone(status);

  return (
    <Badge
      data-tone={tone}
      className={cn(
        'rounded-full border-transparent font-heading text-[11px] font-medium tracking-wide',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label ?? formatStatusLabel(status)}
    </Badge>
  );
}

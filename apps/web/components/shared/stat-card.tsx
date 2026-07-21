import type { ReactNode } from 'react';
import { Card, CardContent, Icon, cn } from '@hms/ui';

type StatCardVariant = 'default' | 'primary' | 'danger';

type StatCardProps = {
  icon: string;
  label: string;
  value: string;
  helper?: ReactNode;
  progress?: number;
  variant?: StatCardVariant;
  className?: string;
};

const CARD_CLASSES: Record<StatCardVariant, string> = {
  default: '',
  primary: 'border-transparent bg-primary-container text-white',
  danger: '',
};

const LABEL_CLASSES: Record<StatCardVariant, string> = {
  default: 'text-slate-500',
  primary: 'text-white/80',
  danger: 'text-slate-500',
};

const ICON_CLASSES: Record<StatCardVariant, string> = {
  default: 'bg-info-tint text-primary',
  primary: 'bg-white/20 text-white',
  danger: 'bg-danger-tint text-danger',
};

const VALUE_CLASSES: Record<StatCardVariant, string> = {
  default: 'text-slate-900',
  primary: 'text-white',
  danger: 'text-danger',
};

const HELPER_CLASSES: Record<StatCardVariant, string> = {
  default: 'text-slate-500',
  primary: 'text-white/80',
  danger: 'text-danger',
};

const PROGRESS_TRACK_CLASSES: Record<StatCardVariant, string> = {
  default: 'bg-slate-100',
  primary: 'bg-white/20',
  danger: 'bg-danger-tint',
};

const PROGRESS_BAR_CLASSES: Record<StatCardVariant, string> = {
  default: 'bg-primary-container',
  primary: 'bg-white',
  danger: 'bg-danger',
};

export function StatCard({
  icon,
  label,
  value,
  helper,
  progress,
  variant = 'default',
  className,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        'rounded-xl border-slate-200 py-0 shadow-none',
        CARD_CLASSES[variant],
        className,
      )}
    >
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <p
            className={cn(
              'font-heading text-xs font-medium uppercase tracking-wider',
              LABEL_CLASSES[variant],
            )}
          >
            {label}
          </p>
          <span
            className={cn(
              'flex size-9 items-center justify-center rounded-lg',
              ICON_CLASSES[variant],
            )}
          >
            <Icon name={icon} size={20} />
          </span>
        </div>
        <p
          className={cn(
            'font-heading text-3xl font-semibold tracking-tight',
            VALUE_CLASSES[variant],
          )}
        >
          {value}
        </p>
        {helper ? (
          <div className={cn('text-xs', HELPER_CLASSES[variant])}>{helper}</div>
        ) : null}
        {typeof progress === 'number' ? (
          <div
            className={cn('h-1.5 overflow-hidden rounded-full', PROGRESS_TRACK_CLASSES[variant])}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn('h-full rounded-full', PROGRESS_BAR_CLASSES[variant])}
              style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

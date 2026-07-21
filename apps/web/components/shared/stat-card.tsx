import type { ReactNode } from 'react';
import { Card, CardContent, Icon, cn } from '@hms/ui';

type StatCardProps = {
  icon: string;
  label: string;
  value: string;
  helper?: ReactNode;
  progress?: number;
  variant?: 'default' | 'primary';
  className?: string;
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
  const isPrimary = variant === 'primary';

  return (
    <Card
      className={cn(
        'rounded-xl border-slate-200 py-0 shadow-none',
        isPrimary && 'border-transparent bg-primary-container text-white',
        className,
      )}
    >
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <p
            className={cn(
              'font-heading text-xs font-medium uppercase tracking-wider',
              isPrimary ? 'text-white/80' : 'text-slate-500',
            )}
          >
            {label}
          </p>
          <span
            className={cn(
              'flex size-9 items-center justify-center rounded-lg',
              isPrimary ? 'bg-white/20 text-white' : 'bg-info-tint text-primary',
            )}
          >
            <Icon name={icon} size={20} />
          </span>
        </div>
        <p
          className={cn(
            'font-heading text-3xl font-semibold tracking-tight',
            isPrimary ? 'text-white' : 'text-slate-900',
          )}
        >
          {value}
        </p>
        {helper ? (
          <div className={cn('text-xs', isPrimary ? 'text-white/80' : 'text-slate-500')}>
            {helper}
          </div>
        ) : null}
        {typeof progress === 'number' ? (
          <div
            className={cn('h-1.5 overflow-hidden rounded-full', isPrimary ? 'bg-white/20' : 'bg-slate-100')}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn('h-full rounded-full', isPrimary ? 'bg-white' : 'bg-primary-container')}
              style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

import type { ReactNode } from 'react';
import { Card, CardContent, Icon, cn } from '@hms/ui';

type EmptyStateProps = {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon = 'inbox', title, description, action, className }: EmptyStateProps) {
  return (
    <Card className={cn('rounded-xl border-slate-200 py-0 shadow-none', className)}>
      <CardContent className="flex flex-col items-center justify-center gap-2 p-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Icon name={icon} size={22} />
        </span>
        <p className="font-heading text-sm font-semibold text-slate-900">{title}</p>
        {description ? <p className="max-w-sm text-sm text-slate-500">{description}</p> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

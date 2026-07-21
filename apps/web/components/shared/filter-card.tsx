import type { ReactNode } from 'react';
import { Card, CardContent, cn } from '@hms/ui';

type FilterCardProps = {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function FilterCard({ children, actions, className }: FilterCardProps) {
  return (
    <Card className={cn('rounded-xl border-slate-200 py-0 shadow-none', className)}>
      <CardContent className="flex flex-wrap items-end justify-between gap-4 p-4">
        <div className="flex flex-wrap items-end gap-3">{children}</div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}

'use client';

import { Card, CardContent, cn } from '@hms/ui';
import type { ReactNode } from 'react';

type AnalyticsCardProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** A dashboard panel: a titled card holding one chart or table. */
export function AnalyticsCard({
  title,
  subtitle,
  action,
  className,
  children,
}: AnalyticsCardProps) {
  return (
    <Card className={cn('min-w-0 rounded-[14px] border-slate-200 py-0 shadow-none', className)}>
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="text-[13px] text-slate-500">{subtitle}</p> : null}
          </div>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

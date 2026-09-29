'use client';

import { Card, CardContent, Icon } from '@hms/ui';
import type { ReactNode } from 'react';

type AnalyticsKpiTileProps = {
  icon: string;
  label: string;
  value: string;
  delta?: ReactNode;
  helper?: string;
};

/** One headline figure with its change and a line of context. */
export function AnalyticsKpiTile({ icon, label, value, delta, helper }: AnalyticsKpiTileProps) {
  return (
    <Card className="min-w-0 flex-1 rounded-[14px] border-slate-200 py-0 shadow-none">
      <CardContent className="flex flex-col gap-2 px-5 py-[18px]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-[0.06em] text-slate-500 uppercase">
            {label}
          </span>
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-surface-container-low text-primary">
            <Icon name={icon} size={20} />
          </span>
        </div>
        <div className="text-[30px] font-bold tracking-tight text-slate-900 tabular-nums">
          {value}
        </div>
        {delta}
        {helper ? <div className="text-xs text-slate-500">{helper}</div> : null}
      </CardContent>
    </Card>
  );
}

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useFormatter } from 'next-intl';

export type CashierBreakdownLine = {
  key: string;
  label: string;
  count: number;
  totalAmount: number;
};

type CashierReportBreakdownCardProps = {
  title: string;
  emptyMessage: string;
  lines: CashierBreakdownLine[];
};

export function CashierReportBreakdownCard({
  title,
  emptyMessage,
  lines,
}: CashierReportBreakdownCardProps) {
  const format = useFormatter();
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {lines.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {lines.map((line) => (
              <li key={line.key} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-sm text-slate-800">{line.label}</p>
                  <p className="text-xs text-slate-500">
                    {line.count} payment{line.count === 1 ? '' : 's'}
                  </p>
                </div>
                <p className="text-sm font-medium text-slate-900">
                  {format.number(line.totalAmount, {
                    style: 'currency',
                    currency: 'IDR',
                    maximumFractionDigits: 2,
                  })}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {emptyMessage}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

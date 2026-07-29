'use client';

import { useState } from 'react';
import { Card, CardContent, DatePicker } from '@hms/ui';

import { CashierReportBreakdownCard } from '#components/client/billing/cashier-report-breakdown-card';
import { formatRupiah } from '#lib/billing/format-rupiah';
import { useCashierDailyReport } from '#lib/billing/use-cashier-daily-report';
import { formatStatusLabel } from '#lib/shared/status-label';

export function CashierReportPanel() {
  // Empty means "the clinic's today", which only the server can decide.
  const [date, setDate] = useState<string>('');
  const reportQuery = useCashierDailyReport(date);
  const report = reportQuery.report;

  return (
    <div className="space-y-5">
      <Card className="rounded-xl border-slate-200 shadow-none">
        <CardContent className="flex flex-wrap items-end justify-between gap-4 p-4">
          <div>
            <label
              htmlFor="cashier-report-date"
              className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
            >
              Clinic Day
            </label>
            <DatePicker
              id="cashier-report-date"
              className="w-48"
              placeholder="Today"
              value={date}
              onValueChange={setDate}
            />
          </div>
          <div className="text-right">
            <p className="font-heading text-xs font-medium text-slate-600">Settled</p>
            <p className="font-heading text-2xl font-semibold text-slate-900">
              {report ? formatRupiah(report.totals.totalAmount) : '—'}
            </p>
            <p className="text-xs text-slate-500">
              {report ? `${report.totals.count} payment${report.totals.count === 1 ? '' : 's'}` : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      {reportQuery.isPending ? <p className="text-sm text-slate-500">Loading report...</p> : null}

      {reportQuery.error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {reportQuery.error.message}
        </p>
      ) : null}

      {report ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <CashierReportBreakdownCard
            title="By Payment Method"
            emptyMessage="No payments settled on this day."
            lines={report.byMethod.map((line) => ({
              key: line.method,
              label: formatStatusLabel(line.method),
              count: line.count,
              totalAmount: line.totalAmount,
            }))}
          />
          <CashierReportBreakdownCard
            title="By Doctor"
            emptyMessage="No payments settled on this day."
            lines={report.byDoctor.map((line) => ({
              key: line.doctorId,
              label: line.doctorName,
              count: line.count,
              totalAmount: line.totalAmount,
            }))}
          />
        </div>
      ) : null}

      <p className="text-xs text-slate-500">
        Built from payments, so voided and unpaid invoices never appear here.
      </p>
    </div>
  );
}

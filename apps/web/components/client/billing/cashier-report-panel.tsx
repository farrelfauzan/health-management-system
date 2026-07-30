'use client';

import { useState } from 'react';
import { Card, CardContent, DatePicker } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { CashierReportBreakdownCard } from '#components/client/billing/cashier-report-breakdown-card';
import { useCashierDailyReport } from '#lib/billing/use-cashier-daily-report';
import { formatStatusLabel } from '#lib/shared/status-label';

export function CashierReportPanel() {
  const t = useTranslations('operations.billing');
  const format = useFormatter();
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
              placeholder={t('today')}
              value={date}
              onValueChange={setDate}
            />
          </div>
          <div className="text-right">
            <p className="font-heading text-xs font-medium text-slate-600">{t('labels.settled')}</p>
            <p className="font-heading text-2xl font-semibold text-slate-900">
              {report
                ? format.number(report.totals.totalAmount, {
                    style: 'currency',
                    currency: 'IDR',
                    maximumFractionDigits: 2,
                  })
                : '—'}
            </p>
            <p className="text-xs text-slate-500">
              {report
                ? `${report.totals.count} payment${report.totals.count === 1 ? '' : 's'}`
                : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      {reportQuery.isPending ? (
        <p className="text-sm text-slate-500">{t('loadingReport')}</p>
      ) : null}

      {reportQuery.error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {t('invoiceError')}
        </p>
      ) : null}

      {report ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <CashierReportBreakdownCard
            title={t('paymentMethods')}
            emptyMessage={t('noPayments')}
            lines={report.byMethod.map((line) => ({
              key: line.method,
              label: formatStatusLabel(line.method),
              count: line.count,
              totalAmount: line.totalAmount,
            }))}
          />
          <CashierReportBreakdownCard
            title={t('byDoctor')}
            emptyMessage={t('noPayments')}
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

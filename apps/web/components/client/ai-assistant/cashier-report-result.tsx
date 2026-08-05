'use client';

import type { GetDailyCashierReportToolResult } from '@hms/shared-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ToolResultHeadline } from '#components/client/ai-assistant/tool-result-headline';
import { ToolResultNotice } from '#components/client/ai-assistant/tool-result-notice';
import { formatRupiah } from '#lib/billing/format-rupiah';

type CashierReportResultProps = {
  result: GetDailyCashierReportToolResult;
};

/**
 * `get_daily_cashier_report` — the day's settled total as the headline, then
 * the split by payment method and by doctor. Only settled payments are
 * counted, which the empty state says out loud: a clinic day with unpaid
 * invoices and no settlements is not the same fact as a clinic day with no
 * activity.
 */
export function CashierReportResult({ result }: CashierReportResultProps) {
  const t = useTranslations('aiAssistant.toolResults');
  if (result.paymentCount === 0) {
    return <ToolResultNotice message={t('cashierEmpty', { date: result.date })} />;
  }
  return (
    <div className="space-y-3">
      <ToolResultHeadline
        text={t('cashierHeadline', {
          total: formatRupiah(result.totalAmount),
          count: result.paymentCount,
        })}
      />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('cashierColumns.method')}</TableHead>
              <TableHead className="text-right">{t('cashierColumns.count')}</TableHead>
              <TableHead className="text-right">{t('cashierColumns.amount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.byMethod.map((line) => (
              <TableRow key={line.method}>
                <TableCell className="font-medium text-slate-900">{line.method}</TableCell>
                <TableCell className="text-right tabular-nums text-slate-500">
                  {line.count}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatRupiah(line.totalAmount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {result.byDoctor.length === 0 ? null : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('cashierColumns.doctor')}</TableHead>
                <TableHead className="text-right">{t('cashierColumns.count')}</TableHead>
                <TableHead className="text-right">{t('cashierColumns.amount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Two practitioners can share a name, and `doctorId` is dropped
                  by the projection on purpose — position is the only key left. */}
              {result.byDoctor.map((line, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium text-slate-900">{line.doctorName}</TableCell>
                  <TableCell className="text-right tabular-nums text-slate-500">
                    {line.count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRupiah(line.totalAmount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

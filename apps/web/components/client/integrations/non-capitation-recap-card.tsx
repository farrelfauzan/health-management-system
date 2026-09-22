'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  MarkNonCapitationLinesInput,
  NonCapitationMarkResponse,
  NonCapitationRecapLine,
} from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Icon,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { NonCapitationRecapRow } from '#components/client/integrations/non-capitation-recap-row';
import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { LocalizedMonthPicker } from '#components/client/shared/localized-month-picker';
import { bpjsNonCapitationRecapControllerMarkLinesV1 } from '#lib/api/generated/bpjs-non-capitation/bpjs-non-capitation';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { formatRupiah } from '#lib/billing/format-rupiah';
import { downloadNonCapitationRecap } from '#lib/bpjs-non-capitation/download-non-capitation-recap';
import { invalidateNonCapitationQueries } from '#lib/bpjs-non-capitation/invalidate-non-capitation-queries';
import { useNonCapitationRecap } from '#lib/bpjs-non-capitation/use-non-capitation-recap';

type NonCapitationRecapCardProps = {
  initialMonth: string;
  canWrite: boolean;
};

function buildLineKey(line: Pick<NonCapitationRecapLine, 'serviceType' | 'sourceId'>): string {
  return `${line.serviceType}:${line.sourceId}`;
}

function isMarkable(line: NonCapitationRecapLine): boolean {
  return line.status !== 'SENT' && line.status !== 'EXPIRED';
}

/**
 * The month's recap (P25-T16): the induk's filing date, the totals, the
 * lines with their status chips, marking lines sent, and the CSV and the PDF
 * letter for the induk.
 */
export function NonCapitationRecapCard({ initialMonth, canWrite }: NonCapitationRecapCardProps) {
  const t = useTranslations('operations.integrations.nonCapitation.recap');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(initialMonth);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const recapQuery = useNonCapitationRecap(month);
  const recap = recapQuery.data;
  const markableLines = (recap?.lines ?? []).filter(isMarkable);

  const download = useMutation({
    mutationFn: (fileFormat: 'csv' | 'pdf') =>
      downloadNonCapitationRecap({ month, format: fileFormat }),
    onError: (error) => notifyApiError(error, t('exportError')),
  });
  const mark = useMutation({
    mutationFn: async (payload: MarkNonCapitationLinesInput) =>
      parseApiSuccess<NonCapitationMarkResponse>(
        await bpjsNonCapitationRecapControllerMarkLinesV1(payload),
        t('markError'),
      ).data,
    onSuccess: async (result) => {
      setSelectedKeys(new Set());
      await invalidateNonCapitationQueries(queryClient);
      toast.success(t('markSuccess', { count: result.markedCount }));
    },
    onError: (error) => notifyApiError(error, t('markError')),
  });

  function changeMonth(next: string): void {
    setMonth(next);
    setSelectedKeys(new Set());
  }

  function toggleLine(line: NonCapitationRecapLine, isSelected: boolean): void {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (isSelected) {
        next.add(buildLineKey(line));
      } else {
        next.delete(buildLineKey(line));
      }
      return next;
    });
  }

  function toggleAll(isSelected: boolean): void {
    setSelectedKeys(new Set(isSelected ? markableLines.map(buildLineKey) : []));
  }

  function markSelected(): void {
    const items = markableLines
      .filter((line) => selectedKeys.has(buildLineKey(line)))
      .map((line) => ({ serviceType: line.serviceType, sourceId: line.sourceId }));
    mark.mutate({ month, items });
  }

  const deadlineLabel = recap
    ? format.dateTime(new Date(`${recap.filingDeadline}T00:00:00Z`), {
        dateStyle: 'long',
        timeZone: 'UTC',
      })
    : '';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5">
            <FormLabel htmlFor="non-capitation-month" className="text-xs text-slate-600">
              {t('month')}
            </FormLabel>
            <div className="w-44">
              <LocalizedMonthPicker
                id="non-capitation-month"
                value={month}
                onValueChange={changeMonth}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={download.isPending}
              onClick={() => download.mutate('csv')}
            >
              <Icon name="download" size={18} />
              {t('downloadCsv')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={download.isPending}
              onClick={() => download.mutate('pdf')}
            >
              <Icon name="picture_as_pdf" size={18} />
              {t('downloadPdf')}
            </Button>
          </div>
        </div>
        {recapQuery.isPending ? <p className="text-sm text-slate-500">{t('loading')}</p> : null}
        {recapQuery.isError ? <InlineNotice tone="error">{t('loadError')}</InlineNotice> : null}
        {recap ? (
          <>
            <InlineNotice tone={recap.daysUntilFilingDeadline < 0 ? 'error' : 'info'}>
              {t('deadline', { date: deadlineLabel })} ·{' '}
              {recap.daysUntilFilingDeadline < 0
                ? t('deadlinePassed', { days: -recap.daysUntilFilingDeadline })
                : t('daysLeft', { days: recap.daysUntilFilingDeadline })}
            </InlineNotice>
            {recap.settings.isConfigured ? null : (
              <InlineNotice tone="warning">{t('notConfigured')}</InlineNotice>
            )}
            {recap.statusCounts.EXPIRED > 0 ? (
              <InlineNotice tone="error">
                {t('expiredWarning', { count: recap.statusCounts.EXPIRED })}
              </InlineNotice>
            ) : null}
            {recap.unpricedCount > 0 ? (
              <InlineNotice tone="warning">
                {t('unpriced', { count: recap.unpricedCount })}
              </InlineNotice>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="space-y-0.5">
                <p className="font-semibold">
                  {t('total', {
                    count: recap.lines.length,
                    amount: formatRupiah(recap.totalAmount),
                  })}
                </p>
                {recap.maximumCoachingFeeAmount === null ? null : (
                  <p className="text-xs text-slate-600">
                    {t('coachingFee', { amount: formatRupiah(recap.maximumCoachingFeeAmount) })}
                  </p>
                )}
              </div>
              {canWrite ? (
                <Button
                  type="button"
                  disabled={selectedKeys.size === 0 || mark.isPending}
                  onClick={markSelected}
                >
                  <Icon name="task_alt" size={17} />
                  {mark.isPending ? t('marking') : t('markSelected', { count: selectedKeys.size })}
                </Button>
              ) : null}
            </div>
            {recap.lines.length === 0 ? (
              <p className="text-sm text-slate-500">{t('empty')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      {canWrite && markableLines.length > 0 ? (
                        <Checkbox
                          aria-label={t('selectAll')}
                          checked={selectedKeys.size === markableLines.length}
                          onCheckedChange={(checked) => toggleAll(checked === true)}
                        />
                      ) : null}
                    </TableHead>
                    <TableHead>{t('columns.date')}</TableHead>
                    <TableHead>{t('columns.patient')}</TableHead>
                    <TableHead>{t('columns.service')}</TableHead>
                    <TableHead>{t('columns.examiner')}</TableHead>
                    <TableHead className="text-right">{t('columns.tariff')}</TableHead>
                    <TableHead>{t('columns.documents')}</TableHead>
                    <TableHead>{t('columns.status')}</TableHead>
                    <TableHead>{t('columns.expires')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recap.lines.map((line) => (
                    <NonCapitationRecapRow
                      key={buildLineKey(line)}
                      line={line}
                      isSelectable={canWrite}
                      isSelected={selectedKeys.has(buildLineKey(line))}
                      onSelectedChange={(isSelected) => toggleLine(line, isSelected)}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

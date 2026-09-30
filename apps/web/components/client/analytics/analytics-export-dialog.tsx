'use client';

import { useState } from 'react';
import { ANALYTICS_EXPORT_TABLE_KEYS, type AnalyticsExportDashboardValue } from '@hms/shared-types';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Label,
  toast,
} from '@hms/ui';
import { useFormatter, useTranslations, type DateTimeFormatOptions } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { downloadAnalyticsExport } from '#lib/analytics/download-analytics-export';
import { formatAnalyticsDateRange } from '#lib/analytics/format-analytics-date-range';
import { notifyApiError } from '#lib/api/notify-api-error';

type AnalyticsExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboard: AnalyticsExportDashboardValue;
  dashboardTitle: string;
  filter: AnalyticsFilterState;
};

/**
 * Which of the dashboard's tables go into the CSV (P29-T10). Every table is
 * ticked to start with; the note says what the file never holds and that the
 * export is recorded, before the button is pressed rather than after.
 */
export function AnalyticsExportDialog({
  open,
  onOpenChange,
  dashboard,
  dashboardTitle,
  filter,
}: AnalyticsExportDialogProps) {
  const t = useTranslations('analytics.export');
  const format = useFormatter();
  const formatDate = (value: Date, options: DateTimeFormatOptions) =>
    format.dateTime(value, options);
  const tableKeys: readonly string[] = ANALYTICS_EXPORT_TABLE_KEYS[dashboard];
  const operationsT = useTranslations('analytics.export.tables.operations');
  const financeT = useTranslations('analytics.export.tables.finance');
  const caseMixT = useTranslations('analytics.export.tables.case-mix');
  const pharmacyT = useTranslations('analytics.export.tables.pharmacy');
  const laboratoryT = useTranslations('analytics.export.tables.laboratory');
  const reportingT = useTranslations('analytics.export.tables.reporting');
  // The keys come from the same list the messages are written for; a spec
  // on the API side holds that list to the tables it registers.
  const labelTable = (key: string): string => {
    switch (dashboard) {
      case 'operations':
        return operationsT(key as Parameters<typeof operationsT>[0]);
      case 'finance':
        return financeT(key as Parameters<typeof financeT>[0]);
      case 'case-mix':
        return caseMixT(key as Parameters<typeof caseMixT>[0]);
      case 'pharmacy':
        return pharmacyT(key as Parameters<typeof pharmacyT>[0]);
      case 'laboratory':
        return laboratoryT(key as Parameters<typeof laboratoryT>[0]);
      default:
        return reportingT(key as Parameters<typeof reportingT>[0]);
    }
  };
  const [chosenKeys, setChosenKeys] = useState<readonly string[]>(tableKeys);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  function toggle(key: string, isChecked: boolean): void {
    setChosenKeys((current) =>
      isChecked
        ? tableKeys.filter((candidate) => candidate === key || current.includes(candidate))
        : current.filter((candidate) => candidate !== key),
    );
  }
  async function handleDownload(): Promise<void> {
    if (chosenKeys.length === 0) {
      setError(t('chooseOne'));
      return;
    }
    setError(null);
    setIsDownloading(true);
    try {
      await downloadAnalyticsExport({ dashboard, filter, tableKeys: chosenKeys });
      toast.success(t('success'));
      onOpenChange(false);
    } catch (caughtError) {
      setError(notifyApiError(caughtError, t('error')));
    } finally {
      setIsDownloading(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {t('title', {
              dashboard: dashboardTitle,
              range: formatAnalyticsDateRange(filter, formatDate),
            })}
          </DialogTitle>
          <DialogDescription>{t('tablesLabel')}</DialogDescription>
        </DialogHeader>
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">{t('tablesLabel')}</legend>
          {tableKeys.map((key) => (
            <Label
              key={key}
              className="flex items-center gap-2.5 text-sm font-normal text-slate-900"
            >
              <Checkbox
                checked={chosenKeys.includes(key)}
                onCheckedChange={(checked) => toggle(key, checked === true)}
                disabled={isDownloading}
              />
              {labelTable(key)}
            </Label>
          ))}
        </fieldset>
        <p className="text-xs leading-relaxed text-slate-500">{t('note')}</p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            className="bg-primary-container hover:bg-primary"
            disabled={isDownloading}
            onClick={() => void handleDownload()}
          >
            <Icon name="download" size={18} />
            {isDownloading ? t('downloading') : t('download')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

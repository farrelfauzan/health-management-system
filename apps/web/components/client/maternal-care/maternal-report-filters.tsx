'use client';

import type { MaternalReportVillageOption } from '@hms/shared-types';
import { Button, Combobox, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { LocalizedMonthPicker } from '#components/client/shared/localized-month-picker';
import { FilterCard } from '#components/shared/filter-card';

/** The combobox value that stands for "every village"; a code is never empty. */
const ALL_VILLAGES_VALUE = '';
/** The rows without a recorded village; a Kemendagri code never has this shape. */
const NO_VILLAGE_VALUE = 'tanpa-desa';

type MaternalReportFiltersProps = {
  month: string;
  onMonthChange: (month: string) => void;
  villageCode: string | null;
  /** `null` hides the village picker: the monthly reports are clinic-wide. */
  villages: MaternalReportVillageOption[] | null;
  onVillageChange: (villageCode: string | null) => void;
  isDownloading: boolean;
  onDownload: (format: 'csv' | 'pdf') => void;
};

/** Month, village and the two download buttons above every report (P25-T15). */
export function MaternalReportFilters({
  month,
  onMonthChange,
  villageCode,
  villages,
  onVillageChange,
  isDownloading,
  onDownload,
}: MaternalReportFiltersProps) {
  const t = useTranslations('maternalCare.reports');
  const options = (villages ?? [])
    .filter((village) => village.code !== null)
    .map((village) => ({ value: village.code ?? NO_VILLAGE_VALUE, label: village.name }));

  return (
    <FilterCard
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isDownloading}
            onClick={() => onDownload('csv')}
          >
            <Icon name="download" size={18} />
            {t('actions.downloadCsv')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isDownloading}
            onClick={() => onDownload('pdf')}
          >
            <Icon name="picture_as_pdf" size={18} />
            {t('actions.downloadPdf')}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <FormLabel htmlFor="maternal-report-month" className="font-heading text-xs text-slate-600">
          {t('filters.month')}
        </FormLabel>
        <div className="w-44">
          <LocalizedMonthPicker
            id="maternal-report-month"
            value={month}
            onValueChange={onMonthChange}
          />
        </div>
      </div>
      {villages === null ? null : (
        <div className="space-y-1.5">
          <FormLabel
            htmlFor="maternal-report-village"
            className="font-heading text-xs text-slate-600"
          >
            {t('filters.village')}
          </FormLabel>
          <div className="w-64">
            <Combobox
              id="maternal-report-village"
              options={options}
              value={villageCode ?? ALL_VILLAGES_VALUE}
              placeholder={t('filters.allVillages')}
              emptyOptionLabel={t('filters.allVillages')}
              searchPlaceholder={t('filters.searchVillage')}
              emptyMessage={t('filters.noVillages')}
              onChange={(value) => onVillageChange(value === ALL_VILLAGES_VALUE ? null : value)}
            />
          </div>
        </div>
      )}
    </FilterCard>
  );
}

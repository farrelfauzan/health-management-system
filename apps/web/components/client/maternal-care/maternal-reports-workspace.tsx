'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@hms/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { BirthsDeathsPreview } from '#components/client/maternal-care/births-deaths-preview';
import { KohortRegisterPreview } from '#components/client/maternal-care/kohort-register-preview';
import { MaternalReportFilters } from '#components/client/maternal-care/maternal-report-filters';
import { MonthlyKiaPreview } from '#components/client/maternal-care/monthly-kia-preview';
import { notifyApiError } from '#lib/api/notify-api-error';
import { downloadMaternalReport } from '#lib/maternal-reports/download-maternal-report';
import { isKohortRegisterTab } from '#lib/maternal-reports/is-kohort-register-tab';
import { MATERNAL_REPORT_TAB_LABEL_KEYS } from '#lib/maternal-reports/maternal-report-tab-label-keys';
import {
  MATERNAL_REPORT_TABS,
  type MaternalReportTab,
} from '#lib/maternal-reports/maternal-report-tabs';
import { useKohortRegister } from '#lib/maternal-reports/use-kohort-register';
import { useTabSearchParam } from '#lib/navigation/use-tab-search-param';

type MaternalReportsWorkspaceProps = {
  initialTab: MaternalReportTab;
  /** The clinic's current month, `YYYY-MM`, resolved on the server. */
  initialMonth: string;
};

/**
 * The registers and monthly reports (P25-T15): a month and village filter, a
 * tab per register, the on-screen preview and the CSV and PDF downloads. The
 * tab lives in the URL; the month and village are page state, because a
 * bookmark to "October" would be wrong by November.
 */
export function MaternalReportsWorkspace({
  initialTab,
  initialMonth,
}: MaternalReportsWorkspaceProps) {
  const t = useTranslations('maternalCare.reports');
  const { tab, setTab } = useTabSearchParam<MaternalReportTab>({
    key: 'tab',
    allowed: MATERNAL_REPORT_TABS,
    fallback: 'kohort-ibu',
    initialTab,
  });
  const [month, setMonth] = useState(initialMonth);
  const [villageCode, setVillageCode] = useState<string | null>(null);
  const isRegister = isKohortRegisterTab(tab);
  const register = useKohortRegister({
    register: isRegister ? tab : 'kohort-ibu',
    month,
    villageCode: isRegister ? villageCode : null,
    enabled: isRegister,
  });
  const download = useMutation({
    mutationFn: (format: 'csv' | 'pdf') =>
      downloadMaternalReport({
        kind: tab,
        month,
        villageCode: isRegister ? villageCode : null,
        format,
      }),
    onError: (error) => {
      notifyApiError(error, t('actions.exportError'));
    },
  });

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(value) => setTab(value as MaternalReportTab)}>
        <TabsList>
          {MATERNAL_REPORT_TABS.map((option) => (
            <TabsTrigger key={option} value={option}>
              {t(`tabs.${MATERNAL_REPORT_TAB_LABEL_KEYS[option]}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <MaternalReportFilters
        month={month}
        onMonthChange={setMonth}
        villageCode={villageCode}
        villages={isRegister ? (register.data?.villages ?? []) : null}
        onVillageChange={setVillageCode}
        isDownloading={download.isPending}
        onDownload={(format) => download.mutate(format)}
      />
      {isRegister ? (
        <KohortRegisterPreview
          register={register.data ?? null}
          isPending={register.isPending}
          isError={register.isError}
        />
      ) : null}
      {tab === 'monthly-kia' ? <MonthlyKiaPreview month={month} /> : null}
      {tab === 'births-deaths' ? <BirthsDeathsPreview month={month} /> : null}
    </div>
  );
}

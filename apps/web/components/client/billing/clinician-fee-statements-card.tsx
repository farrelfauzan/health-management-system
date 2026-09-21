'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicianFeeStatementDetail } from '#components/client/billing/clinician-fee-statement-detail';
import { ClinicianFeeSummaryTable } from '#components/client/billing/clinician-fee-summary-table';
import { LocalizedMonthPicker } from '#components/client/shared/localized-month-picker';
import { useClinicianFeePeriodSummary } from '#lib/clinician-fees/use-clinician-fee-period-summary';

type ClinicianFeeStatementsCardProps = {
  currentPeriod: string;
};

/**
 * The monthly jasa medis statement (P27-T06): every clinician's total for the
 * month, and one clinician's lines with a CSV export.
 */
export function ClinicianFeeStatementsCard({ currentPeriod }: ClinicianFeeStatementsCardProps) {
  const t = useTranslations('operations.billing.fees.statements');
  const [period, setPeriod] = useState<string>(currentPeriod);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const { summary, isPending, isError } = useClinicianFeePeriodSummary(period);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          <div className="w-44">
            <LocalizedMonthPicker
              aria-label={t('period')}
              value={period}
              onValueChange={(value) => {
                setPeriod(value);
                setDoctorId(null);
              }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {doctorId === null ? (
          <ClinicianFeeSummaryTable
            summary={summary}
            isPending={isPending}
            isError={isError}
            onView={setDoctorId}
          />
        ) : (
          <ClinicianFeeStatementDetail
            doctorId={doctorId}
            period={period}
            onBack={() => setDoctorId(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

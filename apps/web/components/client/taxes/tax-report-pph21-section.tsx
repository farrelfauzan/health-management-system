'use client';

import { useState } from 'react';
import type { Pph21ReportLine, Pph21ReportSummary, TaxReportLine } from '@hms/shared-types';
import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { TaxReportPph21LinesTable } from '#components/client/taxes/tax-report-pph21-lines-table';
import { TaxReportPph21Summary } from '#components/client/taxes/tax-report-pph21-summary';
import { useTaxReportIdentifiers } from '#lib/taxes/use-tax-report-identifiers';

type TaxReportPph21SectionProps = {
  reportId: string;
  summary: Pph21ReportSummary;
  lines: TaxReportLine[];
};

/**
 * The PPh 21 bukan pegawai draft (P27-T07): the month's summary and one BP21
 * row per clinician. Identities are masked until the reader reveals them,
 * which the API audits — the button is the deliberate act that read requires.
 */
export function TaxReportPph21Section({ reportId, summary, lines }: TaxReportPph21SectionProps) {
  const t = useTranslations('operations.taxes.reports.pph21.identifiers');
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const identifiersQuery = useTaxReportIdentifiers(reportId, isRevealed);
  const pph21Lines = lines as Pph21ReportLine[];
  const hasRevealableLines = pph21Lines.some((line) => line.identityStatus !== 'MISSING');

  return (
    <div className="space-y-4">
      <TaxReportPph21Summary summary={summary} />
      {pph21Lines.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {hasRevealableLines ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isRevealed && identifiersQuery.isPending}
                onClick={() => setIsRevealed(!isRevealed)}
              >
                <Icon name={isRevealed ? 'visibility_off' : 'visibility'} size={16} />
                {isRevealed ? t('hide') : t('reveal')}
              </Button>
            ) : null}
          </div>
          {isRevealed && identifiersQuery.isPending ? (
            <p className="text-sm text-slate-500">{t('revealing')}</p>
          ) : null}
          {isRevealed && identifiersQuery.isError ? (
            <InlineNotice tone="error">{t('error')}</InlineNotice>
          ) : null}
          {isRevealed && identifiersQuery.identifiers ? (
            <InlineNotice tone="warning">{t('audit')}</InlineNotice>
          ) : null}
          <TaxReportPph21LinesTable
            summary={summary}
            lines={pph21Lines}
            identifiers={isRevealed ? identifiersQuery.identifiers?.clinicians : undefined}
          />
        </>
      ) : null}
    </div>
  );
}

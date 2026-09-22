'use client';

import { useMutation } from '@tanstack/react-query';
import { Button, Icon, toast } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { notifyApiError } from '#lib/api/notify-api-error';
import { notifyStatement } from '#lib/api/notify-statement';
import { downloadCoretaxBp21Xml } from '#lib/taxes/download-coretax-bp21-xml';
import { resolveTaxReportErrorCode } from '#lib/taxes/resolve-tax-report-error-code';
import { useCoretaxBp21Validation } from '#lib/taxes/use-coretax-bp21-validation';

type TaxReportCoretaxBp21CardProps = {
  reportId: string;
  period: string;
};

/**
 * The Coretax BP21 file for a finalized PPh 21 month (P27-T08). Checks the
 * report against DJP's BP21 v4 template first and lists every problem, per
 * clinician, so the download button is only offered for a file Coretax can
 * take. The download is audited; the clinic uploads and files in Coretax.
 */
export function TaxReportCoretaxBp21Card({ reportId, period }: TaxReportCoretaxBp21CardProps) {
  const t = useTranslations('operations.taxes.reports.coretax');
  const tErrors = useTranslations('operations.taxes.reports.errors');
  const locale = useLocale();
  const { validation, isPending, isError, refetch } = useCoretaxBp21Validation(reportId, true);
  const downloadMutation = useMutation({ mutationFn: downloadCoretaxBp21Xml });

  async function handleDownload(): Promise<void> {
    try {
      await downloadMutation.mutateAsync({ reportId, period });
      toast.success(t('downloaded'));
    } catch (caughtError) {
      const code = resolveTaxReportErrorCode(caughtError);
      if (code) {
        notifyStatement({ tone: 'error', title: tErrors(code) });
        await refetch();
        return;
      }
      notifyApiError(caughtError, t('downloadError'));
    }
  }

  if (isPending) {
    return <p className="text-sm text-slate-500">{t('checking')}</p>;
  }
  if (isError || !validation) {
    return <InlineNotice tone="error">{t('loadError')}</InlineNotice>;
  }
  const publishedOn = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
    new Date(`${validation.template.publishedOn}T00:00:00`),
  );
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-heading text-sm font-semibold text-slate-800">{t('title')}</h3>
          <p className="text-sm text-slate-600">
            {t('description', { template: validation.template.title, publishedOn })}
          </p>
          <a
            href={validation.template.catalogueUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary"
          >
            <Icon name="open_in_new" size={14} />
            {t('source')}
          </a>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!validation.isExportable || downloadMutation.isPending}
          onClick={() => void handleDownload()}
        >
          <Icon name="download" size={18} />
          {t('download')}
        </Button>
      </div>
      {validation.isExportable ? (
        <InlineNotice tone="info">
          {t('ready', { count: validation.lineCount })}{' '}
          {validation.skippedCount > 0 ? t('skipped', { count: validation.skippedCount }) : null}
        </InlineNotice>
      ) : (
        <InlineNotice tone="warning" title={t('blocked')}>
          <ul className="list-disc space-y-1 pl-5">
            {validation.issues.map((issue) => (
              <li key={`${issue.subjectId ?? 'clinic'}-${issue.code}`}>
                <span className="font-medium">{issue.subjectLabel ?? t('clinic')}</span>
                {': '}
                {t(`issues.${issue.code}`)}
              </li>
            ))}
          </ul>
        </InlineNotice>
      )}
      {validation.isExportable ? <p className="text-xs text-slate-500">{t('audit')}</p> : null}
    </section>
  );
}

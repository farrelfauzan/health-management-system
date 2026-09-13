'use client';

import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { EncounterSatusehatRecordLineRow } from '#components/client/encounters/encounter-satusehat-record-line-row';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { useSatusehatRecordComparison } from '#lib/encounters/use-satusehat-record-comparison';

type EncounterSatusehatRecordCardProps = {
  encounterId: string;
};

/**
 * "Does SATUSEHAT hold what I recorded?" for the treating doctor (P21-T04).
 *
 * Nothing is read until the doctor clicks: each check reads the national record
 * live. Visibility is decided by the workspace (`SatusehatRecord` read, finished
 * visit, clinic entitled); the API refuses anyone but the treating doctor
 * whatever this card is shown to.
 */
export function EncounterSatusehatRecordCard({ encounterId }: EncounterSatusehatRecordCardProps) {
  const t = useTranslations('clinical.encounters.satusehatRecord');
  const format = useFormatter();
  const [isRequested, setIsRequested] = useState<boolean>(false);
  const { comparison, error, isFetching, refetch } = useSatusehatRecordComparison(
    encounterId,
    isRequested,
  );

  function handleCheck(): void {
    if (isRequested) {
      void refetch();
      return;
    }
    setIsRequested(true);
  }

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="font-heading text-base">{t('title')}</CardTitle>
          <p className="text-xs text-slate-500">{t('subtitle')}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isFetching}
          onClick={handleCheck}
        >
          <Icon name="sync" size={16} />
          {isFetching ? t('checking') : t(comparison ? 'recheck' : 'check')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isRequested ? <p className="text-sm text-slate-500">{t('idle')}</p> : null}
        {error && !isFetching ? (
          <InlineNotice tone="error">{resolveApiErrorMessage(error, t('loadFailed'))}</InlineNotice>
        ) : null}
        {comparison && !comparison.isSubmitted ? (
          <InlineNotice tone="warning">{t('notSubmitted')}</InlineNotice>
        ) : null}
        {comparison?.isSubmitted && !comparison.hasResourceList ? (
          <InlineNotice tone="warning">{t('noResourceList')}</InlineNotice>
        ) : null}
        {comparison && comparison.unreadableResourceCount > 0 ? (
          <InlineNotice tone="warning">
            {t('unreadable', { count: comparison.unreadableResourceCount })}
          </InlineNotice>
        ) : null}
        {comparison && comparison.lines.length === 0 ? (
          <p className="text-sm text-slate-500">{t('empty')}</p>
        ) : null}
        {comparison && comparison.lines.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {comparison.lines.map((line) => (
              <EncounterSatusehatRecordLineRow
                key={`${line.category}-${line.code ?? line.display}`}
                line={line}
              />
            ))}
          </ul>
        ) : null}
        {comparison ? (
          <p className="text-xs text-slate-400">
            {t('checkedAt', {
              time: format.dateTime(new Date(comparison.checkedAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

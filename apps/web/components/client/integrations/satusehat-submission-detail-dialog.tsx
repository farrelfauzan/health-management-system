'use client';

import { useState } from 'react';
import type { SatusehatSubmissionCheckView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Icon,
} from '@hms/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { SatusehatCheckResultRow } from '#components/client/integrations/satusehat-check-result-row';
import { SatusehatResourceGroupRow } from '#components/client/integrations/satusehat-resource-group-row';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { satusehatSubmissionControllerCheckSubmissionV1 } from '#lib/api/generated/satusehat/satusehat';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { useSatusehatSubmissionDetail } from '#lib/integrations/use-satusehat-submission-detail';

type SatusehatSubmissionDetailDialogProps = {
  submissionId: string | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * What one submission sent, and — on demand — whether SATUSEHAT still holds it
 * (P21-T03).
 *
 * Everything here is **presence, never content**. The API's projection is a
 * whitelist, so there is no clinical value to render even by accident: this
 * shows resource types, counts, ids and version stamps, and names skipped items
 * only by reason category. A skipped medication's name would tell the front desk
 * what the patient was prescribed.
 *
 * The check runs on a click rather than on open, because each one costs a read
 * per resource against a platform every vendor shares.
 */
export function SatusehatSubmissionDetailDialog({
  submissionId,
  onOpenChange,
}: SatusehatSubmissionDetailDialogProps) {
  const t = useTranslations('operations.integrations.satusehatDetail');
  const { detail, isPending, error } = useSatusehatSubmissionDetail(submissionId);
  const [check, setCheck] = useState<SatusehatSubmissionCheckView | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const checkMutation = useMutation({
    mutationFn: async () =>
      parseApiSuccess<SatusehatSubmissionCheckView>(
        await satusehatSubmissionControllerCheckSubmissionV1(submissionId ?? ''),
        t('checkFailed'),
      ),
    onSuccess: (envelope) => {
      setCheckError(null);
      setCheck(envelope.data);
    },
    onError: (caughtError: unknown) => {
      setCheck(null);
      setCheckError(resolveApiErrorMessage(caughtError, t('checkFailed')));
    },
  });

  return (
    <Dialog
      open={submissionId !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCheck(null);
          setCheckError(null);
        }
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        {isPending ? <p className="text-sm text-slate-500">{t('loading')}</p> : null}
        {error ? <InlineNotice tone="error">{t('loadFailed')}</InlineNotice> : null}

        {detail && !detail.hasResourceList ? (
          <InlineNotice tone="warning">{t('noList')}</InlineNotice>
        ) : null}
        {detail?.isBackfilled ? <InlineNotice tone="info">{t('backfilled')}</InlineNotice> : null}

        {detail && detail.resources.length > 0 ? (
          <div className="space-y-2">
            <p className="font-heading text-sm font-medium text-slate-700">{t('sentHeading')}</p>
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {detail.resources.map((group) => (
                <SatusehatResourceGroupRow key={group.resourceType} group={group} />
              ))}
            </ul>
          </div>
        ) : null}

        {detail?.hasResourceList ? (
          <div className="space-y-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={checkMutation.isPending}
              onClick={() => checkMutation.mutate()}
            >
              <Icon name="cloud_sync" size={16} />
              {checkMutation.isPending ? t('checking') : t('check')}
            </Button>
            {checkError ? <InlineNotice tone="error">{checkError}</InlineNotice> : null}
            {check ? (
              <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                {check.results.map((result) => (
                  <SatusehatCheckResultRow
                    key={`${result.resourceType}-${result.satusehatId}`}
                    result={result}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import type { SatusehatDoctorIhsPreview } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import {
  satusehatLinkControllerLinkDoctorByIhsV1,
  satusehatLinkControllerPreviewDoctorIhsLinkV1,
} from '#lib/api/generated/satusehat/satusehat';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateDoctorQueries } from '#lib/doctors/invalidate-doctor-queries';
import { resolveSatusehatIhsLinkErrorKey } from '#lib/integrations/resolve-satusehat-ihs-link-error-key';
import type { NoticeTone } from '#lib/shared/notice-tone';

type DoctorSatusehatIhsLinkDialogProps = {
  doctorId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const NIK_SUFFIX_TONES: Record<SatusehatDoctorIhsPreview['nikSuffixCheck'], NoticeTone> = {
  MATCHES: 'success',
  DIFFERS: 'error',
  UNAVAILABLE: 'warning',
};

/**
 * Links a doctor by a hand-typed IHS number when their NIK matches several
 * SATUSEHAT records (P21-T08).
 *
 * Two steps on purpose. "Check" reads what SATUSEHAT holds and saves nothing.
 * The operator then confirms against the SATUSEHAT name shown beside ours. The
 * platform masks the NIK to its last three digits, so a digit mismatch blocks
 * the link, but matching digits alone never replace reading the name. The API
 * reads the id back again on confirm, so this preview is never what gets saved.
 */
export function DoctorSatusehatIhsLinkDialog({
  doctorId,
  open,
  onOpenChange,
}: DoctorSatusehatIhsLinkDialogProps) {
  const t = useTranslations('clinical.doctors.manualLink');
  const queryClient = useQueryClient();
  const [ihsNumber, setIhsNumber] = useState<string>('');
  const [preview, setPreview] = useState<SatusehatDoctorIhsPreview | null>(null);
  const [errorKey, setErrorKey] = useState<ReturnType<
    typeof resolveSatusehatIhsLinkErrorKey
  > | null>(null);
  const previewMutation = useMutation({
    mutationFn: async () =>
      parseApiSuccess<SatusehatDoctorIhsPreview>(
        await satusehatLinkControllerPreviewDoctorIhsLinkV1(doctorId, {
          ihsNumber: ihsNumber.trim(),
        }),
        t('errors.unreachable'),
      ),
    onSuccess: (envelope) => {
      setErrorKey(null);
      setPreview(envelope.data);
    },
    onError: (error: unknown) => {
      setPreview(null);
      setErrorKey(resolveSatusehatIhsLinkErrorKey(error));
    },
  });
  const linkMutation = useMutation({
    mutationFn: () =>
      satusehatLinkControllerLinkDoctorByIhsV1(doctorId, { ihsNumber: preview?.ihsNumber ?? '' }),
    onSuccess: async () => {
      await invalidateDoctorQueries(queryClient);
      toast.success(t('success'));
      handleOpenChange(false);
    },
    onError: (error: unknown) => setErrorKey(resolveSatusehatIhsLinkErrorKey(error)),
  });
  const canConfirm =
    preview !== null &&
    preview.nikSuffixCheck !== 'DIFFERS' &&
    !preview.alreadyLinked &&
    !linkMutation.isPending;

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      setIhsNumber('');
      setPreview(null);
      setErrorKey(null);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            previewMutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <label
              htmlFor="doctor-ihs-number"
              className="font-heading text-xs font-medium text-slate-600"
            >
              {t('ihsLabel')}
            </label>
            <div className="flex gap-2">
              <Input
                id="doctor-ihs-number"
                value={ihsNumber}
                autoComplete="off"
                className="font-mono"
                onChange={(event) => {
                  setIhsNumber(event.target.value);
                  setPreview(null);
                }}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={ihsNumber.trim().length === 0 || previewMutation.isPending}
              >
                {previewMutation.isPending ? t('checking') : t('check')}
              </Button>
            </div>
          </div>
          {errorKey ? <InlineNotice tone="error">{t(`errors.${errorKey}`)}</InlineNotice> : null}
          {preview ? (
            <div className="space-y-3">
              <dl className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                <div>
                  <dt className="font-heading text-xs font-medium text-slate-600">
                    {t('ourRecord')}
                  </dt>
                  <dd className="text-sm text-slate-800">{preview.doctorName}</dd>
                </div>
                <div>
                  <dt className="font-heading text-xs font-medium text-slate-600">
                    {t('satusehatRecord')}
                  </dt>
                  <dd className="text-sm text-slate-800">{preview.satusehatName ?? t('noName')}</dd>
                </div>
              </dl>
              <InlineNotice tone={NIK_SUFFIX_TONES[preview.nikSuffixCheck]}>
                {t(`nikSuffix.${preview.nikSuffixCheck}`)}
              </InlineNotice>
              {preview.alreadyLinked ? (
                <p className="text-sm text-slate-600">{t('alreadyLinked')}</p>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button
              type="button"
              className="bg-primary-container hover:bg-primary"
              disabled={!canConfirm}
              onClick={() => linkMutation.mutate()}
            >
              {linkMutation.isPending ? t('linking') : t('confirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

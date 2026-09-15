'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  MidwifeFormularyApplyResponse,
  MidwifeFormularyPreviewResponse,
} from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { MidwifeFormularyItemRow } from '#components/client/pharmacy/midwife-formulary-item-row';
import { InlineNotice } from '#components/client/shared/inline-notice';
import {
  getMedicationControllerPreviewMidwifeFormularyV1QueryKey,
  medicationControllerApplyMidwifeFormularyV1,
  medicationControllerPreviewMidwifeFormularyV1,
} from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import type { ApplyMidwifeFormularyDto } from '#lib/api/generated/model/applyMidwifeFormularyDto';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { useApiQuery } from '#lib/api/use-api-query';
import { buildMidwifeFormularySelection } from '#lib/pharmacy/build-midwife-formulary-selection';
import { collectApplicableMidwifeFormularyIds } from '#lib/pharmacy/collect-applicable-midwife-formulary-ids';
import { invalidatePharmacyQueries } from '#lib/pharmacy/invalidate-pharmacy-queries';

type MidwifeFormularyApplyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MidwifeFormularyApplyDialog({
  open,
  onOpenChange,
}: MidwifeFormularyApplyDialogProps) {
  const t = useTranslations('pharmacyInventory.midwifeFormulary');
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewQuery = useApiQuery<MidwifeFormularyPreviewResponse>({
    queryKey: getMedicationControllerPreviewMidwifeFormularyV1QueryKey(),
    queryFn: (signal) => medicationControllerPreviewMidwifeFormularyV1(signal),
    errorMessage: t('previewError'),
    enabled: open,
  });
  const applyMutation = useMutation({
    mutationFn: (payload: ApplyMidwifeFormularyDto) =>
      medicationControllerApplyMidwifeFormularyV1(payload),
  });
  const preview = previewQuery.data;
  const items = preview?.items ?? [];
  const applicableIds = collectApplicableMidwifeFormularyIds(items);
  const effectiveSelection = selectedIds ?? buildMidwifeFormularySelection(items);
  const unflaggedIds = new Set(
    items.flatMap((entry) =>
      entry.matches
        .filter((match) => !match.isMidwifePrescribable)
        .map((match) => match.medicationId),
    ),
  );
  const idsToApply = [...effectiveSelection].filter(
    (id) => applicableIds.has(id) && unflaggedIds.has(id),
  );

  function handleToggle(medicationId: string, isChecked: boolean): void {
    const next = new Set(effectiveSelection);
    if (isChecked) {
      next.add(medicationId);
    } else {
      next.delete(medicationId);
    }
    setSelectedIds(next);
  }

  async function handleConfirm(): Promise<void> {
    setError(null);
    try {
      const response = await applyMutation.mutateAsync({ medicationIds: idsToApply });
      const envelope = parseApiSuccess<MidwifeFormularyApplyResponse>(response, t('applyError'));
      await invalidatePharmacyQueries(queryClient);
      toast.success(t('applied', { count: envelope.data.flaggedCount }));
      onOpenChange(false);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, t('applyError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-4">
          {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
          {previewQuery.isPending ? <p className="text-sm text-slate-500">{t('loading')}</p> : null}
          {previewQuery.isError ? (
            <InlineNotice tone="error">{t('previewError')}</InlineNotice>
          ) : null}
          {preview?.templateLookup === 'SKIPPED' ? (
            <p className="text-sm text-slate-600">{t('templateLookupSkipped')}</p>
          ) : null}
          {items.length > 0 ? (
            <ul className="space-y-3">
              {items.map((entry) => (
                <MidwifeFormularyItemRow
                  key={entry.item.code}
                  entry={entry}
                  selectedIds={effectiveSelection}
                  applicableIds={applicableIds}
                  onToggle={handleToggle}
                />
              ))}
            </ul>
          ) : null}
          {preview && preview.unmatchedItems.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">{t('unmatchedTitle')}</h3>
              <p className="text-xs text-slate-500">{t('unmatchedHint')}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {preview.unmatchedItems.map((item) => (
                  <li key={item.code}>{item.displayName}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={idsToApply.length === 0 || applyMutation.isPending}
            onClick={() => void handleConfirm()}
          >
            {applyMutation.isPending ? t('applying') : t('confirm', { count: idsToApply.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

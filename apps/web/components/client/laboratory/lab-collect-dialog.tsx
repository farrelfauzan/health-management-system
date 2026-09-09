'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CollectLabSpecimensInput,
  LabSpecimenLabel,
  LabSpecimenTypeValue,
  LabSpecimenView,
  LabWorklistItem,
} from '@hms/shared-types';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Textarea,
  toast,
} from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import {
  labSpecimenControllerCollectLabSpecimensV1,
  labSpecimenControllerGetSpecimenLabelV1,
} from '#lib/api/generated/laboratory-specimens/laboratory-specimens';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateLabQueries } from '#lib/laboratory/invalidate-lab-queries';
import { printSpecimenLabels } from '#lib/laboratory/print-specimen-labels';
import { useLabOrder } from '#lib/laboratory/use-lab-order';

type LabCollectDialogProps = {
  item: LabWorklistItem | null;
  onClose: () => void;
};

/**
 * Drawing the tubes (`P18-T08`). Shows the specimen types the order still
 * needs — one tube per type, which is what happens at the chair — records the
 * draw, and prints one label per tube from the accession numbers the API
 * allocated. Printing is a browser print of a 50 × 25 mm page; a blocked
 * pop-up is said out loud rather than swallowed, because a rack of unlabelled
 * tubes is the failure this dialog exists to prevent.
 */
export function LabCollectDialog({ item, onClose }: LabCollectDialogProps) {
  const t = useTranslations('operations.laboratory.collect');
  const tCatalog = useTranslations('operations.laboratory');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<string>('');
  const orderQuery = useLabOrder(item?.id ?? '', item !== null);
  const pendingTypes = resolvePendingSpecimenTypes(orderQuery.labOrder?.items ?? []);
  const collectMutation = useMutation({
    mutationFn: (payload: CollectLabSpecimensInput) =>
      labSpecimenControllerCollectLabSpecimensV1(item?.id ?? '', payload),
  });

  function handleClose(): void {
    setNotes('');
    onClose();
  }

  async function handleConfirm(): Promise<void> {
    try {
      const response = await collectMutation.mutateAsync(
        notes.trim() ? { notes: notes.trim() } : {},
      );
      const specimens = parseApiSuccess<LabSpecimenView[]>(response, t('error')).data;
      toast.success(t('success', { count: specimens.length }));
      await invalidateLabQueries(queryClient);
      const labels = await readLabels(specimens);
      if (!printSpecimenLabels(labels, locale)) {
        toast.warning(t('popupBlocked'));
      }
      handleClose();
    } catch (caughtError) {
      notifyApiError(caughtError, t('error'));
    }
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => (open ? undefined : handleClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title', { orderNumber: item?.orderNumber ?? '' })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">{t('specimenTypes')}</p>
          {orderQuery.isPending ? (
            <Skeleton className="h-8 w-full" />
          ) : orderQuery.isError ? (
            <InlineNotice tone="error">{t('loadError')}</InlineNotice>
          ) : pendingTypes.length === 0 ? (
            <p className="text-sm text-slate-500">{t('nothingToDraw')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pendingTypes.map((type) => (
                <Badge key={type} variant="secondary">
                  {tCatalog(`specimenTypes.${type}`)}
                </Badge>
              ))}
            </div>
          )}
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t('notesPlaceholder')}
            disabled={collectMutation.isPending}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={collectMutation.isPending || pendingTypes.length === 0}
          >
            {collectMutation.isPending ? t('pending') : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One tube per distinct type among the items still waiting for one — the server's own rule. */
function resolvePendingSpecimenTypes(
  items: readonly { status: string; specimenType: LabSpecimenTypeValue; specimenId?: string }[],
): LabSpecimenTypeValue[] {
  const types = new Set<LabSpecimenTypeValue>();
  for (const item of items) {
    if (item.status === 'PENDING' && !item.specimenId) {
      types.add(item.specimenType);
    }
  }
  return [...types];
}

async function readLabels(specimens: readonly LabSpecimenView[]): Promise<LabSpecimenLabel[]> {
  return Promise.all(
    specimens.map(
      async (specimen) =>
        parseApiSuccess<LabSpecimenLabel>(
          await labSpecimenControllerGetSpecimenLabelV1(specimen.id),
          'Unable to read the specimen label.',
        ).data,
    ),
  );
}

'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  contraceptiveDiscontinuationReasonSchema,
  type ContraceptiveDiscontinuationReasonValue,
} from '@hms/shared-types';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { familyPlanningControllerDiscontinueCourseV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';

type DiscontinueFamilyPlanningDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  familyPlanningRecordId: string;
};

/** Ending a live KB course with a date and a reason (P25-T14). */
export function DiscontinueFamilyPlanningDialog({
  open,
  onOpenChange,
  familyPlanningRecordId,
}: DiscontinueFamilyPlanningDialogProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [discontinuedOn, setDiscontinuedOn] = useState<string>('');
  const [reason, setReason] = useState<ContraceptiveDiscontinuationReasonValue>('SIDE_EFFECT');

  const mutation = useMutation({
    mutationFn: async () =>
      familyPlanningControllerDiscontinueCourseV1(familyPlanningRecordId, {
        discontinuedOn,
        reason,
      }),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t('maternalCare.familyPlanning.toasts.discontinued'));
      onOpenChange(false);
    },
    onError: (error) => notifyApiError(error, t('maternalCare.familyPlanning.loadError')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('maternalCare.familyPlanning.actions.discontinue')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="family-planning-discontinued-on">
              {t('maternalCare.familyPlanning.fields.discontinuedOn')}
            </FormLabel>
            <DatePicker
              id="family-planning-discontinued-on"
              value={discontinuedOn}
              onValueChange={setDiscontinuedOn}
            />
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="family-planning-reason">
              {t('maternalCare.familyPlanning.fields.reason')}
            </FormLabel>
            <Select
              value={reason}
              onValueChange={(value) => setReason(value as ContraceptiveDiscontinuationReasonValue)}
            >
              <SelectTrigger id="family-planning-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contraceptiveDiscontinuationReasonSchema.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`maternalCare.familyPlanning.reasons.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('maternalCare.familyPlanning.actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || discontinuedOn.length === 0}
            onClick={() => mutation.mutate()}
          >
            {t('maternalCare.familyPlanning.actions.discontinue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

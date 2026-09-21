'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  resolveFamilyPlanningNextDueDate,
  type ContraceptiveMethodValue,
} from '@hms/shared-types';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { familyPlanningControllerRecordServiceV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';

type RecordFamilyPlanningServiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  familyPlanningRecordId: string;
  method: ContraceptiveMethodValue;
};

/**
 * One follow-up of a live KB course (P25-T14): a reinjection, a resupply, a
 * control. Its next due date becomes the course's, defaulted from the service
 * day like the start.
 */
export function RecordFamilyPlanningServiceDialog({
  open,
  onOpenChange,
  familyPlanningRecordId,
  method,
}: RecordFamilyPlanningServiceDialogProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [servedOn, setServedOn] = useState<string>('');
  const [action, setAction] = useState<string>('');
  const [nextDueOn, setNextDueOn] = useState<string>('');
  const isCondom = method === 'CONDOM';
  const defaultNextDueOn =
    servedOn.length > 0 ? resolveFamilyPlanningNextDueDate({ method, servedOn }) : null;

  const mutation = useMutation({
    mutationFn: async () =>
      familyPlanningControllerRecordServiceV1(familyPlanningRecordId, {
        servedOn,
        action: action.trim(),
        ...(isCondom || nextDueOn.length === 0 ? {} : { nextDueOn }),
      }),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t('maternalCare.familyPlanning.toasts.serviceRecorded'));
      onOpenChange(false);
    },
    onError: (error) => notifyApiError(error, t('maternalCare.familyPlanning.loadError')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('maternalCare.familyPlanning.actions.recordService')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="family-planning-served-on">
              {t('maternalCare.familyPlanning.fields.servedOn')}
            </FormLabel>
            <DatePicker id="family-planning-served-on" value={servedOn} onValueChange={setServedOn} />
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="family-planning-action">
              {t('maternalCare.familyPlanning.fields.action')}
            </FormLabel>
            <Input
              id="family-planning-action"
              value={action}
              placeholder={t('maternalCare.familyPlanning.hints.actionPlaceholder')}
              onChange={(event) => setAction(event.target.value)}
            />
          </div>
          {isCondom ? null : (
            <div className="space-y-2">
              <FormLabel htmlFor="family-planning-service-next-due-on">
                {t('maternalCare.familyPlanning.fields.nextDueOn')}
              </FormLabel>
              <DatePicker
                id="family-planning-service-next-due-on"
                value={nextDueOn}
                onValueChange={setNextDueOn}
              />
              <p className="text-xs text-slate-500">
                {defaultNextDueOn === null
                  ? t('maternalCare.familyPlanning.hints.enteredNextDueOn')
                  : t('maternalCare.familyPlanning.hints.defaultNextDueOn', {
                      date: defaultNextDueOn,
                    })}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('maternalCare.familyPlanning.actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || servedOn.length === 0 || action.trim().length === 0}
            onClick={() => mutation.mutate()}
          >
            {t('maternalCare.familyPlanning.actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

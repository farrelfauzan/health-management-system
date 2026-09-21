'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { deliveryRecordControllerRecordNewbornV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';
import { toOptionalNumber } from '#lib/maternal-care/to-optional-number';

type RecordNewbornDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryRecordId: string;
  /** How many babies are already recorded, so a stillbirth gets the next slot. */
  recordedCount: number;
};

const OUTCOMES = ['LIVE_BIRTH', 'STILLBIRTH'] as const;
const SEXES = ['FEMALE', 'MALE'] as const;

/**
 * One baby's first hour (P25-T09, FR-INC-03).
 *
 * No field for a live baby's birth order: hers lives on her patient record and
 * is set when she is registered (P24-T10). A stillbirth has no patient record,
 * so she carries her position here instead — offered as the next free slot
 * rather than typed, because getting it wrong is how twins end up out of
 * order.
 */
export function RecordNewbornDialog({
  open,
  onOpenChange,
  deliveryRecordId,
  recordedCount,
}: RecordNewbornDialogProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<string>('LIVE_BIRTH');
  const [sex, setSex] = useState<string>('FEMALE');
  const [birthWeightGrams, setBirthWeightGrams] = useState<string>('');
  const [lengthCm, setLengthCm] = useState<string>('');
  const [apgar1Min, setApgar1Min] = useState<string>('');
  const [apgar5Min, setApgar5Min] = useState<string>('');

  const mutation = useMutation({
    mutationFn: async () =>
      deliveryRecordControllerRecordNewbornV1(deliveryRecordId, {
        outcome: outcome as (typeof OUTCOMES)[number],
        sex: sex as (typeof SEXES)[number],
        ...(outcome === 'STILLBIRTH' ? { stillbirthOrder: recordedCount + 1 } : {}),
        ...(toOptionalNumber(birthWeightGrams) === undefined
          ? {}
          : { birthWeightGrams: toOptionalNumber(birthWeightGrams) }),
        ...(toOptionalNumber(lengthCm) === undefined
          ? {}
          : { lengthCm: toOptionalNumber(lengthCm) }),
        ...(toOptionalNumber(apgar1Min) === undefined
          ? {}
          : { apgar1Min: toOptionalNumber(apgar1Min) }),
        ...(toOptionalNumber(apgar5Min) === undefined
          ? {}
          : { apgar5Min: toOptionalNumber(apgar5Min) }),
      }),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t('maternalCare.delivery.actions.recordNewborn'));
      onOpenChange(false);
    },
    onError: (error) => notifyApiError(error, t('maternalCare.loadError')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('maternalCare.delivery.actions.recordNewborn')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <FormLabel htmlFor="newborn-outcome" required>
                {t('maternalCare.delivery.newborns.outcome')}
              </FormLabel>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger id="newborn-outcome">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`maternalCare.delivery.outcome.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="newborn-sex" required>
                {t('maternalCare.delivery.newborns.sex')}
              </FormLabel>
              <Select value={sex} onValueChange={setSex}>
                <SelectTrigger id="newborn-sex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEXES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`maternalCare.delivery.sex.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="newborn-weight">
                {t('maternalCare.delivery.newborns.weight')}
              </FormLabel>
              <Input
                id="newborn-weight"
                type="number"
                inputMode="numeric"
                value={birthWeightGrams}
                onChange={(event) => setBirthWeightGrams(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="newborn-length">
                {t('maternalCare.delivery.newborns.length')}
              </FormLabel>
              <Input
                id="newborn-length"
                type="number"
                inputMode="decimal"
                value={lengthCm}
                onChange={(event) => setLengthCm(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="apgar-1">
                {t('maternalCare.delivery.newborns.apgar1')}
              </FormLabel>
              <Input
                id="apgar-1"
                type="number"
                inputMode="numeric"
                value={apgar1Min}
                onChange={(event) => setApgar1Min(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="apgar-5">
                {t('maternalCare.delivery.newborns.apgar5')}
              </FormLabel>
              <Input
                id="apgar-5"
                type="number"
                inputMode="numeric"
                value={apgar5Min}
                onChange={(event) => setApgar5Min(event.target.value)}
              />
            </div>
          </div>
          {outcome === 'LIVE_BIRTH' ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {t('maternalCare.delivery.newborns.registerHint')}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('maternalCare.form.cancel')}
          </Button>
          <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {t('maternalCare.delivery.actions.recordNewborn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

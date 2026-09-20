'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { pregnancyEpisodeControllerCreateEpisodeV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';

type StartPregnancyEpisodeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
};

/**
 * "Mulai episode kehamilan" (P25-T06, FR-ANC-01).
 *
 * The HPL is left to the API when an HPHT is given: Naegele is arithmetic, and
 * a date retyped at the counter is a date that can disagree with the one every
 * later number is counted from.
 */
export function StartPregnancyEpisodeDialog({
  open,
  onOpenChange,
  patientId,
}: StartPregnancyEpisodeDialogProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [lastMenstrualPeriodDate, setLastMenstrualPeriodDate] = useState<string>('');
  const [gravida, setGravida] = useState<string>('1');
  const [para, setPara] = useState<string>('0');
  const [abortus, setAbortus] = useState<string>('0');
  const [bloodType, setBloodType] = useState<string>('');
  const [riskNotes, setRiskNotes] = useState<string>('');

  const mutation = useMutation({
    mutationFn: async () =>
      pregnancyEpisodeControllerCreateEpisodeV1(patientId, {
        lastMenstrualPeriodDate: lastMenstrualPeriodDate || undefined,
        gravida: Number(gravida),
        para: Number(para),
        abortus: Number(abortus),
        bloodType: bloodType || undefined,
        riskNotes: riskNotes || undefined,
      }),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t('maternalCare.actions.start'));
      onOpenChange(false);
    },
    onError: (error) => notifyApiError(error, t('maternalCare.loadError')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('maternalCare.actions.start')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <FormLabel htmlFor="lmp">{t('maternalCare.form.lastMenstrualPeriodDate')}</FormLabel>
            <DatePicker
              id="lmp"
              value={lastMenstrualPeriodDate}
              onValueChange={setLastMenstrualPeriodDate}
            />
            <p className="mt-1 text-xs text-slate-500">{t('maternalCare.form.eddHint')}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <FormLabel htmlFor="gravida">{t('maternalCare.form.gravida')}</FormLabel>
              <Input
                id="gravida"
                type="number"
                min={1}
                value={gravida}
                onChange={(event) => setGravida(event.target.value)}
              />
            </div>
            <div>
              <FormLabel htmlFor="para">{t('maternalCare.form.para')}</FormLabel>
              <Input
                id="para"
                type="number"
                min={0}
                value={para}
                onChange={(event) => setPara(event.target.value)}
              />
            </div>
            <div>
              <FormLabel htmlFor="abortus">{t('maternalCare.form.abortus')}</FormLabel>
              <Input
                id="abortus"
                type="number"
                min={0}
                value={abortus}
                onChange={(event) => setAbortus(event.target.value)}
              />
            </div>
          </div>
          <div>
            <FormLabel htmlFor="blood-type">{t('maternalCare.form.bloodType')}</FormLabel>
            <Input
              id="blood-type"
              value={bloodType}
              onChange={(event) => setBloodType(event.target.value)}
            />
          </div>
          <div>
            <FormLabel htmlFor="risk-notes">{t('maternalCare.form.riskNotes')}</FormLabel>
            <Input
              id="risk-notes"
              value={riskNotes}
              onChange={(event) => setRiskNotes(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('maternalCare.form.cancel')}
          </Button>
          <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {t('maternalCare.form.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

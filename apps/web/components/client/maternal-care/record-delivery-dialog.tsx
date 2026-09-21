'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
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
import { deliveryRecordControllerRecordDeliveryV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';
import { toOptionalNumber } from '#lib/maternal-care/to-optional-number';

type RecordDeliveryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  episodeId: string;
  attendantDoctorId: string;
};

const DELIVERY_MODES = ['SPONTANEOUS_VAGINAL', 'ASSISTED_VAGINAL', 'CAESAREAN'] as const;
const TEAR_GRADES = ['NONE', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4'] as const;
/** The grades the API refuses without a referral; the form says so first. */
const TEAR_GRADES_REQUIRING_REFERRAL: readonly string[] = ['GRADE_3', 'GRADE_4'];

/**
 * Recording the birth (P25-T09, FR-INC-01).
 *
 * The kala times are the four the partograf already asks for, and only the
 * birth itself is required — a woman who arrives pushing has no recorded
 * onset. The referral checkbox is forced on for a grade 3 or 4 tear before the
 * request is sent, so the midwife sees *why* rather than a 422.
 */
export function RecordDeliveryDialog({
  open,
  onOpenChange,
  episodeId,
  attendantDoctorId,
}: RecordDeliveryDialogProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [labourOnsetAt, setLabourOnsetAt] = useState<string>('');
  const [fullDilatationAt, setFullDilatationAt] = useState<string>('');
  const [birthAt, setBirthAt] = useState<string>('');
  const [placentaDeliveredAt, setPlacentaDeliveredAt] = useState<string>('');
  const [mode, setMode] = useState<string>('SPONTANEOUS_VAGINAL');
  const [perinealTearGrade, setPerinealTearGrade] = useState<string>('NONE');
  const [episiotomy, setEpisiotomy] = useState<boolean>(false);
  const [bloodLossMl, setBloodLossMl] = useState<string>('');
  const [referredOut, setReferredOut] = useState<boolean>(false);
  const [referralReason, setReferralReason] = useState<string>('');

  const isReferralRequired = TEAR_GRADES_REQUIRING_REFERRAL.includes(perinealTearGrade);

  const mutation = useMutation({
    mutationFn: async () =>
      deliveryRecordControllerRecordDeliveryV1(episodeId, {
        attendantDoctorId,
        ...(labourOnsetAt ? { labourOnsetAt: toInstant(labourOnsetAt) } : {}),
        ...(fullDilatationAt ? { fullDilatationAt: toInstant(fullDilatationAt) } : {}),
        birthAt: toInstant(birthAt),
        ...(placentaDeliveredAt ? { placentaDeliveredAt: toInstant(placentaDeliveredAt) } : {}),
        mode: mode as (typeof DELIVERY_MODES)[number],
        episiotomy,
        perinealTearGrade: perinealTearGrade as (typeof TEAR_GRADES)[number],
        ...(toOptionalNumber(bloodLossMl) === undefined
          ? {}
          : { bloodLossMl: toOptionalNumber(bloodLossMl) }),
        referredOut: referredOut || isReferralRequired,
        ...(referralReason ? { referralReason } : {}),
      }),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t('maternalCare.delivery.actions.record'));
      onOpenChange(false);
    },
    onError: (error) => notifyApiError(error, t('maternalCare.loadError')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('maternalCare.delivery.actions.record')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <FormLabel htmlFor="labour-onset-at">
                {t('maternalCare.delivery.labourOnsetAt')}
              </FormLabel>
              <Input
                id="labour-onset-at"
                type="datetime-local"
                value={labourOnsetAt}
                onChange={(event) => setLabourOnsetAt(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="full-dilatation-at">
                {t('maternalCare.delivery.fullDilatationAt')}
              </FormLabel>
              <Input
                id="full-dilatation-at"
                type="datetime-local"
                value={fullDilatationAt}
                onChange={(event) => setFullDilatationAt(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="birth-at" required>
                {t('maternalCare.delivery.birthAt')}
              </FormLabel>
              <Input
                id="birth-at"
                type="datetime-local"
                value={birthAt}
                onChange={(event) => setBirthAt(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="placenta-delivered-at">
                {t('maternalCare.delivery.placentaDeliveredAt')}
              </FormLabel>
              <Input
                id="placenta-delivered-at"
                type="datetime-local"
                value={placentaDeliveredAt}
                onChange={(event) => setPlacentaDeliveredAt(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <FormLabel htmlFor="delivery-mode" required>
              {t('maternalCare.delivery.mode')}
            </FormLabel>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger id="delivery-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_MODES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`maternalCare.delivery.modes.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FormLabel htmlFor="tear-grade">{t('maternalCare.delivery.tear')}</FormLabel>
            <Select value={perinealTearGrade} onValueChange={setPerinealTearGrade}>
              <SelectTrigger id="tear-grade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAR_GRADES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`maternalCare.delivery.tears.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isReferralRequired ? (
              <p className="rounded-lg bg-warning-tint px-3 py-2 text-xs text-warning-strong">
                {t('maternalCare.delivery.referralRequired')}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <FormLabel htmlFor="blood-loss">{t('maternalCare.delivery.bloodLoss')}</FormLabel>
            <Input
              id="blood-loss"
              type="number"
              inputMode="numeric"
              value={bloodLossMl}
              onChange={(event) => setBloodLossMl(event.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox
              checked={episiotomy}
              onCheckedChange={(checked) => setEpisiotomy(checked === true)}
            />
            {t('maternalCare.delivery.episiotomy')}
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox
              checked={referredOut || isReferralRequired}
              disabled={isReferralRequired}
              onCheckedChange={(checked) => setReferredOut(checked === true)}
            />
            {t('maternalCare.delivery.referredOutLabel')}
          </label>

          {referredOut || isReferralRequired ? (
            <div className="space-y-2">
              <FormLabel htmlFor="referral-reason" required>
                {t('maternalCare.delivery.referralReason')}
              </FormLabel>
              <Input
                id="referral-reason"
                value={referralReason}
                onChange={(event) => setReferralReason(event.target.value)}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('maternalCare.form.cancel')}
          </Button>
          <Button
            type="button"
            disabled={birthAt.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {t('maternalCare.delivery.actions.record')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A `datetime-local` value is wall-clock time with no zone. The API takes UTC
 * instants, so the browser's own zone — which is the clinic's, on a clinic
 * machine — is what resolves it.
 */
function toInstant(localValue: string): string {
  return new Date(localValue).toISOString();
}

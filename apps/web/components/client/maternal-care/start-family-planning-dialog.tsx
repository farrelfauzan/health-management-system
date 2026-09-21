'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CONTRACEPTIVE_METHODS,
  resolveFamilyPlanningNextDueDate,
  type AcceptorTypeValue,
  type ContraceptiveMethodValue,
  type DoctorAuthorityKindValue,
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
  Textarea,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { MidwifeAuthorityRefusalNotice } from '#components/client/encounters/midwife-authority-refusal-notice';
import { FormLabel } from '#components/client/shared/form-label';
import { familyPlanningControllerStartCourseV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { resolveMidwifeAuthorityRefusalKind } from '#lib/encounters/resolve-midwife-authority-refusal-kind';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';

type StartFamilyPlanningDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  providerDoctorId: string;
  /** Set for KB pasca salin: the birth the course is linked to. */
  deliveryRecordId?: string | null;
};

const ACCEPTOR_TYPES: readonly AcceptorTypeValue[] = ['NEW', 'CONTINUING'];
/** IUD and implant control dates are always entered, never defaulted. */
const ENTERED_DUE_DATE_METHODS: readonly ContraceptiveMethodValue[] = ['IUD', 'IMPLANT'];

/**
 * Starting a KB course (P25-T14). The next due date is left empty to take the
 * method's sourced default, which the form shows; a condom hides the field.
 * A midwife refused an IUD or implant is told which authority is missing,
 * inline, like the procedure gate (P25-T03).
 */
export function StartFamilyPlanningDialog({
  open,
  onOpenChange,
  patientId,
  providerDoctorId,
  deliveryRecordId = null,
}: StartFamilyPlanningDialogProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<ContraceptiveMethodValue>('INJECTABLE_3_MONTH');
  const [acceptorType, setAcceptorType] = useState<AcceptorTypeValue>('NEW');
  const [startedOn, setStartedOn] = useState<string>('');
  const [nextDueOn, setNextDueOn] = useState<string>('');
  const [sideEffects, setSideEffects] = useState<string>('');
  const [refusedKind, setRefusedKind] = useState<DoctorAuthorityKindValue | null>(null);
  const isCondom = method === 'CONDOM';
  const isDueDateEntered = ENTERED_DUE_DATE_METHODS.includes(method);
  const defaultNextDueOn =
    startedOn.length > 0 ? resolveFamilyPlanningNextDueDate({ method, servedOn: startedOn }) : null;

  const mutation = useMutation({
    mutationFn: async () =>
      familyPlanningControllerStartCourseV1(patientId, {
        method,
        acceptorType,
        startedOn,
        providerDoctorId,
        ...(deliveryRecordId === null ? {} : { deliveryRecordId }),
        ...(isCondom || nextDueOn.length === 0 ? {} : { nextDueOn }),
        ...(sideEffects.trim().length > 0 ? { sideEffects: sideEffects.trim() } : {}),
      }),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t('maternalCare.familyPlanning.toasts.started'));
      onOpenChange(false);
    },
    onError: (error) => {
      const kind = resolveMidwifeAuthorityRefusalKind(error);
      if (kind !== undefined) {
        setRefusedKind(kind);
        return;
      }
      notifyApiError(error, t('maternalCare.familyPlanning.loadError'));
    },
  });

  function handleSubmit(): void {
    setRefusedKind(null);
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {deliveryRecordId === null
              ? t('maternalCare.familyPlanning.actions.start')
              : t('maternalCare.familyPlanning.actions.startPostDelivery')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <FormLabel htmlFor="family-planning-method">
                {t('maternalCare.familyPlanning.fields.method')}
              </FormLabel>
              <Select
                value={method}
                onValueChange={(value) => setMethod(value as ContraceptiveMethodValue)}
              >
                <SelectTrigger id="family-planning-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACEPTIVE_METHODS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`maternalCare.familyPlanning.methods.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="family-planning-acceptor">
                {t('maternalCare.familyPlanning.fields.acceptorType')}
              </FormLabel>
              <Select
                value={acceptorType}
                onValueChange={(value) => setAcceptorType(value as AcceptorTypeValue)}
              >
                <SelectTrigger id="family-planning-acceptor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCEPTOR_TYPES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`maternalCare.familyPlanning.acceptorTypes.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="family-planning-started-on">
              {t('maternalCare.familyPlanning.fields.startedOn')}
            </FormLabel>
            <DatePicker id="family-planning-started-on" value={startedOn} onValueChange={setStartedOn} />
          </div>
          {isCondom ? (
            <p className="text-xs text-slate-500">
              {t('maternalCare.familyPlanning.hints.condomNoDueDate')}
            </p>
          ) : (
            <div className="space-y-2">
              <FormLabel htmlFor="family-planning-next-due-on">
                {t('maternalCare.familyPlanning.fields.nextDueOn')}
              </FormLabel>
              <DatePicker
                id="family-planning-next-due-on"
                value={nextDueOn}
                onValueChange={setNextDueOn}
              />
              <p className="text-xs text-slate-500">
                {isDueDateEntered || defaultNextDueOn === null
                  ? t('maternalCare.familyPlanning.hints.enteredNextDueOn')
                  : t('maternalCare.familyPlanning.hints.defaultNextDueOn', {
                      date: defaultNextDueOn,
                    })}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <FormLabel htmlFor="family-planning-side-effects">
              {t('maternalCare.familyPlanning.fields.sideEffects')}
            </FormLabel>
            <Textarea
              id="family-planning-side-effects"
              value={sideEffects}
              onChange={(event) => setSideEffects(event.target.value)}
              rows={2}
            />
          </div>
          {refusedKind !== null ? <MidwifeAuthorityRefusalNotice kind={refusedKind} /> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('maternalCare.familyPlanning.actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || startedOn.length === 0}
            onClick={handleSubmit}
          >
            {t('maternalCare.familyPlanning.actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CHILD_VISIT_PURPOSE_INVALID_ERROR_CODE,
  CHILD_VISIT_PURPOSE_REQUIRED_ERROR_CODE,
  isChildVisitPurposeRequired,
  type DoctorAuthorityKindValue,
  type EncounterChildVisitPurposeValue,
  type EncounterListItem,
  type OpenEncounterInput,
  type RegistrationListItem,
} from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from '@hms/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { DoctorCombobox } from '#components/client/doctors/doctor-combobox';
import { EncounterChildVisitPurposeField } from '#components/client/encounters/encounter-child-visit-purpose-field';
import { MidwifeAuthorityRefusalNotice } from '#components/client/encounters/midwife-authority-refusal-notice';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { encounterControllerOpenEncounterV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';
import { parseApiSuccess } from '#lib/api/response';
import { useDoctorsList } from '#lib/doctors/use-doctors-list';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';
import { resolveMidwifeAuthorityRefusalKind } from '#lib/encounters/resolve-midwife-authority-refusal-kind';
import { resolveClinicToday } from '#lib/shared/clinic-today';

const DOCTOR_PICKER_QUERY = { page: 1, limit: 100, isActive: 'true' as const };
type EncounterOpenDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registration: RegistrationListItem;
};

type ChildVisitPurposeErrorCode =
  | typeof CHILD_VISIT_PURPOSE_REQUIRED_ERROR_CODE
  | typeof CHILD_VISIT_PURPOSE_INVALID_ERROR_CODE;

function toCalendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isChildVisitPurposeErrorCode(
  code: string | undefined,
): code is ChildVisitPurposeErrorCode {
  return (
    code === CHILD_VISIT_PURPOSE_REQUIRED_ERROR_CODE || code === CHILD_VISIT_PURPOSE_INVALID_ERROR_CODE
  );
}

export function EncounterOpenDialog({
  open,
  onOpenChange,
  registration,
}: EncounterOpenDialogProps) {
  const router = useRouter();
  const t = useTranslations('clinical');
  const queryClient = useQueryClient();
  // A registration made from an appointment already names the practitioner;
  // a walk-in does not, and the API refuses to guess for an admin actor.
  const [doctorId, setDoctorId] = useState<string>(registration.appointment?.doctor.id ?? '');
  const [childVisitPurpose, setChildVisitPurpose] =
    useState<EncounterChildVisitPurposeValue | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refusedKind, setRefusedKind] = useState<DoctorAuthorityKindValue | null>(null);
  const doctorsQuery = useDoctorsList(DOCTOR_PICKER_QUERY);
  const openMutation = useMutation({
    mutationFn: (payload: OpenEncounterInput) => encounterControllerOpenEncounterV1(payload),
  });
  const selectedDoctor = doctorsQuery.doctors.find((doctor) => doctor.id === doctorId);
  // P25-T03: the same rule the API enforces, so a midwife seeing a child under
  // five is asked before submitting rather than refused after.
  const isPurposeRequired =
    selectedDoctor !== undefined &&
    isChildVisitPurposeRequired({
      profession: selectedDoctor.profession,
      dateOfBirth: toCalendarDate(registration.patient.dateOfBirth),
      asOf: toCalendarDate(resolveClinicToday()),
    });

  function handleOpenError(error: unknown): void {
    const kind = resolveMidwifeAuthorityRefusalKind(error);
    if (kind !== undefined) {
      setRefusedKind(kind);
      return;
    }
    const code = resolveApiErrorCode(error);
    if (isChildVisitPurposeErrorCode(code)) {
      setActionError(t(`encounters.childVisitPurpose.errors.${code}`));
      return;
    }
    setActionError(notifyApiError(error, t('encounters.openError')));
  }

  async function handleConfirm(): Promise<void> {
    setActionError(null);
    setRefusedKind(null);
    if (doctorId.length === 0) {
      setActionError(t('encounters.doctorRequired'));
      return;
    }
    if (isPurposeRequired && childVisitPurpose === null) {
      setActionError(t('encounters.childVisitPurpose.required'));
      return;
    }
    try {
      const response = await openMutation.mutateAsync({
        registrationId: registration.id,
        doctorId,
        ...(isPurposeRequired && childVisitPurpose !== null ? { childVisitPurpose } : {}),
      });
      const envelope = parseApiSuccess<EncounterListItem>(response, t('encounters.openError'));
      await invalidateEncounterQueries(queryClient);
      onOpenChange(false);
      router.push(`/admin/encounters/${envelope.data.id}`);
    } catch (error) {
      handleOpenError(error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('encounters.openAction')}</DialogTitle>
          <DialogDescription>
            {t('encounters.openDescription', { name: registration.patient.fullName })}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label
            htmlFor="open-encounter-doctor"
            className="mb-1.5 font-heading text-xs text-slate-600"
          >
            {t('encounters.attendingDoctor')}
          </Label>
          <DoctorCombobox
            id="open-encounter-doctor"
            doctors={doctorsQuery.doctors}
            value={doctorId}
            isLoading={doctorsQuery.isPending}
            onChange={setDoctorId}
          />
        </div>
        {isPurposeRequired ? (
          <EncounterChildVisitPurposeField
            value={childVisitPurpose}
            onChange={setChildVisitPurpose}
          />
        ) : null}
        {refusedKind ? <MidwifeAuthorityRefusalNotice kind={refusedKind} /> : null}
        {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            className="bg-primary-container hover:bg-primary"
            disabled={openMutation.isPending}
            onClick={() => void handleConfirm()}
          >
            {openMutation.isPending ? t('encounters.opening') : t('encounters.openAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

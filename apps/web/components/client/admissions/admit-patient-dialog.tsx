'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdmitPatientInput } from '@hms/shared-types';
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { BedPickerField } from '#components/client/admissions/bed-picker-field';
import { DoctorCombobox } from '#components/client/doctors/doctor-combobox';
import { admissionFlowControllerAdmitPatientV1 } from '#lib/api/generated/admission-flow/admission-flow';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAdmissionQueries } from '#lib/admissions/invalidate-admission-queries';
import { useDoctorOptions } from '#lib/admissions/use-doctor-options';
import { usePatientOptions } from '#lib/admissions/use-patient-options';
import { formatStatusLabel } from '#lib/shared/status-label';

const MIN_PATIENT_SEARCH_LENGTH = 2;

type AdmitPatientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AdmitPatientDialog({ open, onOpenChange }: AdmitPatientDialogProps) {
  const t = useTranslations('operations');
  const queryClient = useQueryClient();
  const [patientSearch, setPatientSearch] = useState<string>('');
  const [patientId, setPatientId] = useState<string>('');
  const [patientLabel, setPatientLabel] = useState<string>('');
  const [admittingDoctorId, setAdmittingDoctorId] = useState<string>('');
  const [bedId, setBedId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const patientOptions = usePatientOptions(patientSearch);
  const doctorOptions = useDoctorOptions();
  const admitMutation = useMutation({
    mutationFn: (payload: AdmitPatientInput) => admissionFlowControllerAdmitPatientV1(payload),
  });
  const isPatientSearchActive = patientSearch.trim().length >= MIN_PATIENT_SEARCH_LENGTH;
  const patientEmptyMessage = !isPatientSearchActive
    ? t('admissions.patientSearchHint')
    : patientOptions.isFetching
      ? t('common.loading')
      : t('admissions.noPatient');

  function handlePatientChange(nextPatientId: string): void {
    setPatientId(nextPatientId);
    /*
      Name and current status, not MRN: the patient *list* contract does not
      carry an MRN (only the detail response does), and status is the more
      useful disambiguator here anyway — an IN_PATIENT in this list is someone
      already in a bed. The label is kept aside because a later search can
      drop the selected patient out of the fetched options.
    */
    const selectedPatient = patientOptions.patients.find(
      (patient) => patient.id === nextPatientId,
    );
    setPatientLabel(
      selectedPatient
        ? `${selectedPatient.fullName} — ${formatStatusLabel(selectedPatient.status)}`
        : '',
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);

    if (!patientId || !admittingDoctorId || !bedId) {
      setActionError(t('admissions.requiredFields'));
      return;
    }

    try {
      parseApiSuccess(
        await admitMutation.mutateAsync({
          patientId,
          admittingDoctorId,
          bedId,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
        t('admissions.admitError'),
      );
      await invalidateAdmissionQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      // A 409 here is the double-booking guard doing its job: another clerk
      // took the bed between this list rendering and this submit.
      setActionError(notifyApiError(error, t('admissions.admitError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('admissions.admitPatient')}</DialogTitle>
          <DialogDescription>{t('admissions.subtitle')}</DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <Label htmlFor="admit-patient">{t('admissions.patient')}</Label>
            <Combobox
              id="admit-patient"
              options={patientOptions.patients.map((patient) => ({
                value: patient.id,
                label: `${patient.fullName} — ${formatStatusLabel(patient.status)}`,
              }))}
              value={patientId}
              selectedLabel={patientLabel}
              placeholder={t('admissions.selectPatient')}
              searchPlaceholder={t('admissions.searchPatient')}
              emptyMessage={patientEmptyMessage}
              searchValue={patientSearch}
              onSearchValueChange={setPatientSearch}
              shouldFilter={false}
              onChange={handlePatientChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admit-doctor">{t('admissions.doctor')}</Label>
            <DoctorCombobox
              id="admit-doctor"
              doctors={doctorOptions.doctors}
              value={admittingDoctorId}
              isLoading={doctorOptions.isPending}
              onChange={setAdmittingDoctorId}
            />
          </div>
          <BedPickerField
            id="admit-bed"
            label={t('admissions.bed')}
            value={bedId}
            onChange={setBedId}
          />
          <div className="space-y-2">
            <Label htmlFor="admit-reason">{t('admissions.reason')}</Label>
            <Textarea
              id="admit-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={admitMutation.isPending}>
              {admitMutation.isPending ? t('common.saving') : t('admissions.admitPatient')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
